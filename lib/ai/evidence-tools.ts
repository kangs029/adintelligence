/**
 * Read-only evidence tools for the "Ask the evidence" agent (WS2).
 *
 * Every tool reads a single committed artifact and returns the facts plus a
 * `source` envelope (family, human label, "as of" date, provenance) so the
 * agent can cite where each answer came from. Nothing here writes, mutates, or
 * calls the network. The pure `lookup*` / `summarize*` functions hold the
 * logic so they can be unit-tested without a model call; the exported `tool`
 * wrappers are what the agent actually invokes.
 */

import { tool } from "ai";
import { z } from "zod";

import competitorPositioningArtifact from "@/data/artifacts/competitor-positioning.json";
import fxHistoryArtifact from "@/data/artifacts/fx-history.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";

interface ArtifactMeta {
  family?: string;
  source?: string;
  generatedAt?: string;
  provenance?: string;
}

export interface SourceEnvelope {
  family?: string;
  label?: string;
  asOf?: string;
  provenance?: string;
}

function sourceOf(meta: ArtifactMeta): SourceEnvelope {
  return {
    family: meta.family,
    label: meta.source,
    asOf: meta.generatedAt,
    provenance: meta.provenance,
  };
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}\u2026` : clean;
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

interface MarketRecord {
  geoid: string;
  name: string;
  state?: string;
  tier?: 1 | 2 | 3 | 4;
  score?: number;
  population: { asianIndian: number; total: number; moe?: number };
  concentration?: {
    localSharePct?: number;
    multipleOfUS?: number;
    usSharePct?: number;
  };
  income?: { medianHousehold?: number };
  anchorSummary?: {
    temples?: number;
    cricket?: number;
    groceries?: number;
    theaters?: number;
    per10kAI?: number;
  };
  employmentProxy?: { lcaFilings?: number; topEmployers?: string[] };
}

const markets = marketsArtifact.data.markets as unknown as MarketRecord[];
const MARKETS_SOURCE = sourceOf(marketsArtifact.meta as ArtifactMeta);

const rankedMarkets = markets
  .filter((market) => typeof market.score === "number")
  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

function marketRank(geoid: string): number | null {
  const index = rankedMarkets.findIndex((market) => market.geoid === geoid);
  return index === -1 ? null : index + 1;
}

function findMarket(query: string): MarketRecord | undefined {
  const q = query.trim().toLowerCase();
  if (!q) {
    return undefined;
  }
  return (
    markets.find((market) => market.geoid.toLowerCase() === q) ??
    markets.find((market) => market.name.toLowerCase() === q) ??
    markets.find((market) => market.name.toLowerCase().includes(q)) ??
    markets.find((market) => market.state?.toLowerCase() === q)
  );
}

export function lookupMarket(marketQuery: string) {
  const found = findMarket(marketQuery);
  if (!found) {
    return {
      found: false as const,
      query: marketQuery,
      message: `No committed market matches "${marketQuery}". Ask for a covered US metro by name or geoid.`,
      source: MARKETS_SOURCE,
    };
  }

  return {
    found: true as const,
    geoid: found.geoid,
    name: found.name,
    state: found.state ?? null,
    tier: found.tier ?? null,
    score: found.score ?? null,
    rankByScore: marketRank(found.geoid),
    totalRankedMarkets: rankedMarkets.length,
    population: {
      asianIndian: found.population.asianIndian,
      total: found.population.total,
      localSharePct: found.concentration?.localSharePct ?? null,
    },
    concentrationMultipleOfUS: found.concentration?.multipleOfUS ?? null,
    medianHouseholdIncome: found.income?.medianHousehold ?? null,
    anchors: found.anchorSummary ?? null,
    employmentProxy: found.employmentProxy
      ? {
          lcaFilings: found.employmentProxy.lcaFilings ?? null,
          topEmployers: (found.employmentProxy.topEmployers ?? []).slice(0, 5),
        }
      : null,
    source: MARKETS_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// Competitor positioning
// ---------------------------------------------------------------------------

interface PositioningProfile {
  competitor: string;
  positioningLine?: string;
  headline?: string;
  feeClaim?: string;
  speedClaim?: string;
  introOffer?: string;
  landingPageUrl?: string;
  status?: string;
  caveat?: string | null;
  capturedAt?: string;
}

const positioningProfiles =
  competitorPositioningArtifact.data.profiles as unknown as PositioningProfile[];
const POSITIONING_SOURCE = sourceOf(
  competitorPositioningArtifact.meta as ArtifactMeta,
);

export function lookupCompetitorPositioning(competitor?: string) {
  const q = competitor?.trim().toLowerCase();
  const profiles = q
    ? positioningProfiles.filter((profile) =>
        profile.competitor.toLowerCase().includes(q),
      )
    : positioningProfiles;

  return {
    count: profiles.length,
    filteredBy: competitor?.trim() || null,
    profiles: profiles.map((profile) => ({
      competitor: profile.competitor,
      positioningLine: profile.positioningLine ?? null,
      headline: profile.headline ?? null,
      feeClaim: profile.feeClaim ?? null,
      speedClaim: profile.speedClaim ?? null,
      introOffer: profile.introOffer ?? null,
      landingPageUrl: profile.landingPageUrl ?? null,
      status: profile.status ?? null,
      caveat: profile.caveat ?? null,
      capturedAt: profile.capturedAt ?? null,
    })),
    source: POSITIONING_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// Review themes
// ---------------------------------------------------------------------------

interface ReviewTheme {
  theme: string;
  count: number;
  sharePct?: number;
  examples?: { text?: string }[];
}

interface ReviewGroup {
  competitor: string;
  store?: string;
  averageRating?: number;
  sampleSize?: number;
  window?: unknown;
  themes?: ReviewTheme[];
}

const reviewGroups =
  reviewThemesArtifact.data.groups as unknown as ReviewGroup[];
const REVIEWS_SOURCE = sourceOf(reviewThemesArtifact.meta as ArtifactMeta);

export function lookupReviewThemes(competitor: string) {
  const q = competitor.trim().toLowerCase();
  const groups = q
    ? reviewGroups.filter((group) =>
        group.competitor.toLowerCase().includes(q),
      )
    : [];

  if (groups.length === 0) {
    return {
      found: false as const,
      query: competitor,
      message: `No committed review themes for "${competitor}". Covered competitors include Xpat, Remitly, Wise, Xoom, Aspora, Crobo, and Western Union.`,
      source: REVIEWS_SOURCE,
    };
  }

  return {
    found: true as const,
    competitor,
    groups: groups.map((group) => ({
      store: group.store ?? null,
      averageRating: group.averageRating ?? null,
      sampleSize: group.sampleSize ?? null,
      window: group.window ?? null,
      themes: (group.themes ?? []).slice(0, 4).map((theme) => ({
        theme: theme.theme,
        count: theme.count,
        sharePct: theme.sharePct ?? null,
        example: theme.examples?.[0]?.text
          ? truncate(theme.examples[0].text, 180)
          : null,
      })),
    })),
    source: REVIEWS_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// FX history
// ---------------------------------------------------------------------------

interface FxRate {
  date: string;
  rate: number;
}

const fx = fxHistoryArtifact.data as unknown as {
  base: string;
  target: string;
  current: { date: string; rate: number };
  startDate: string;
  endDate: string;
  rates: FxRate[];
  sourceUrl: string;
};
const FX_SOURCE = sourceOf(fxHistoryArtifact.meta as ArtifactMeta);

export function summarizeFxHistory() {
  const rates = fx.rates ?? [];
  const values = rates.map((rate) => rate.rate);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const low = min === null ? null : rates.find((rate) => rate.rate === min);
  const high = max === null ? null : rates.find((rate) => rate.rate === max);

  const step = Math.max(1, Math.floor(rates.length / 12));
  const series = rates.filter((_, index) => index % step === 0);
  const last = rates[rates.length - 1];
  if (last && series[series.length - 1]?.date !== last.date) {
    series.push(last);
  }

  return {
    base: fx.base,
    target: fx.target,
    current: fx.current,
    startDate: fx.startDate,
    endDate: fx.endDate,
    windowLow: low ? { date: low.date, rate: low.rate } : null,
    windowHigh: high ? { date: high.date, rate: high.rate } : null,
    series: series.map((rate) => ({ date: rate.date, rate: rate.rate })),
    sourceUrl: fx.sourceUrl,
    source: FX_SOURCE,
  };
}

// ---------------------------------------------------------------------------
// Tool wrappers (read-only)
// ---------------------------------------------------------------------------

export const evidenceTools = {
  getMarket: tool({
    description:
      "Look up one launch-planning market by geoid or metro/city name. Returns Census-grounded facts: tier, composite score and rank, Asian Indian population and local share, concentration versus the US, median household income, community anchors (temples, cricket, groceries), and an LCA employment proxy. Read-only.",
    inputSchema: z.object({
      market: z
        .string()
        .describe(
          "A market geoid like '31000US19100' or a metro/city name like 'Dallas'.",
        ),
    }),
    execute: async ({ market }) => lookupMarket(market),
  }),

  getCompetitorPositioning: tool({
    description:
      "Return committed competitor positioning snapshots (positioning line, headline, fee claim, speed claim, intro offer, landing page). Optionally filter to one competitor. Read-only.",
    inputSchema: z.object({
      competitor: z
        .string()
        .optional()
        .describe(
          "Optional competitor to filter, e.g. 'Remitly'. Omit for all competitors.",
        ),
    }),
    execute: async ({ competitor }) => lookupCompetitorPositioning(competitor),
  }),

  getReviewThemes: tool({
    description:
      "Return public app-store review themes for one competitor (theme label, share, count, one example, average rating, sample size, store). Read-only.",
    inputSchema: z.object({
      competitor: z
        .string()
        .describe("Competitor name, e.g. 'Remitly', 'Wise', or 'Xpat'."),
    }),
    execute: async ({ competitor }) => lookupReviewThemes(competitor),
  }),

  getFxHistory: tool({
    description:
      "Return the committed USD to INR FX history: current rate, window low and high, a bounded sampled series, and the public source URL. Read-only.",
    inputSchema: z.object({}),
    execute: async () => summarizeFxHistory(),
  }),
};
