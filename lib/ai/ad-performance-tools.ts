/**
 * Read-only ad performance tools for the "Ask the ad analyst" agent.
 *
 * Every tool reads from the xpat-ad-performance artifact and returns facts
 * plus a `source` envelope so the agent can cite where each answer came from.
 * Nothing here writes, mutates, or calls the network.
 *
 * In production (NORMALIZED_BUCKET_NAME set): reads from S3.
 * In local development: reads from the committed JSON artifact.
 */

import { tool } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArtifactMeta {
  family?: string;
  source?: string;
  generatedAt?: string;
  provenance?: string;
}

interface AdRecord {
  adSetId: string | null;
  adSetName: string | null;
  campaignId: string;
  campaignName: string | null;
  capturedAt: string;
  clicks: number;
  conversions: number | null;
  cpa: number | null;
  cpc: number | null;
  cpm: number | null;
  ctr: number | null;
  date: string;
  geoId: string | null;
  geoName: string | null;
  impressions: number;
  objective: string | null;
  platform: "Meta" | "Google";
  reach: number | null;
  spendUsd: number;
  status: string;
}

export interface SourceEnvelope {
  family?: string;
  label?: string;
  asOf?: string;
  provenance?: string;
}

interface AdArtifact {
  meta: ArtifactMeta;
  data: {
    records: AdRecord[];
    dateRange: { from: string; to: string } | null;
  };
}

// ---------------------------------------------------------------------------
// Artifact loading — S3 in production, local file in development
// ---------------------------------------------------------------------------

let cachedArtifact: AdArtifact | null = null;

async function loadArtifact(): Promise<AdArtifact> {
  if (cachedArtifact) return cachedArtifact;

  const bucket = process.env.NORMALIZED_BUCKET_NAME;

  if (bucket) {
    try {
      // Production: read from S3 using AWS SDK
      // Use dedicated import to avoid require() issues with bundlers
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      // S3 bucket is in ap-southeast-2 — use explicit region, not Bedrock region
      const s3Region = process.env.AWS_REGION ?? "ap-southeast-2";
      const s3 = new S3Client({ region: s3Region });
      const response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: "xpat-ad-performance.json" }),
      );
      const body = await response.Body?.transformToString();
      if (!body) throw new Error("Empty artifact body from S3");
      cachedArtifact = JSON.parse(body) as AdArtifact;
    } catch {
      // S3 read failed — fall back to committed local artifact
      const local = await import("@/data/artifacts/xpat-ad-performance.json");
      cachedArtifact = local.default as unknown as AdArtifact;
    }
  } else {
    // Local development: read committed JSON file
    const local = await import("@/data/artifacts/xpat-ad-performance.json");
    cachedArtifact = local.default as unknown as AdArtifact;
  }

  return cachedArtifact;
}

const DEFAULT_SOURCE: SourceEnvelope = { family: "xpat-ad-performance" };

function buildSource(meta: ArtifactMeta): SourceEnvelope {
  return {
    family: meta.family,
    label: meta.source,
    asOf: meta.generatedAt,
    provenance: meta.provenance,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function filterByDateRange(
  recs: AdRecord[],
  generatedAt: string,
  dateRangeParam: "last_7d" | "last_30d" | "all" = "all",
): AdRecord[] {
  if (dateRangeParam === "all") return recs;
  const now = new Date(generatedAt);
  const days = dateRangeParam === "last_7d" ? 7 : 30;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return recs.filter((r) => r.date >= cutoff);
}

function filterByPlatform(
  recs: AdRecord[],
  platform?: "Meta" | "Google",
): AdRecord[] {
  if (!platform) return recs;
  return recs.filter((r) => r.platform === platform);
}

// ---------------------------------------------------------------------------
// Tool 1 — Get performance summary
// ---------------------------------------------------------------------------

export function summarizePerformance(
  recs: AdRecord[],
  source: SourceEnvelope = DEFAULT_SOURCE,
): {
  totalSpendUsd: number;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number | null;
  avgCpc: number | null;
  avgCpm: number | null;
  avgCpa: number | null;
  cpaNote: string | null;
  recordCount: number;
  dateRange: { from: string; to: string } | null;
  platforms: string[];
  source: SourceEnvelope;
} {
  if (recs.length === 0) {
    return {
      totalSpendUsd: 0,
      totalImpressions: 0,
      totalClicks: 0,
      avgCtr: null,
      avgCpc: null,
      avgCpm: null,
      avgCpa: null,
      cpaNote: null,
      recordCount: 0,
      dateRange: null,
      platforms: [],
      source,
    };
  }

  const totalSpendUsd = round2(recs.reduce((sum, r) => sum + r.spendUsd, 0));
  const totalImpressions = recs.reduce((sum, r) => sum + r.impressions, 0);
  const totalClicks = recs.reduce((sum, r) => sum + r.clicks, 0);
  const avgCtr =
    totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : null;
  const avgCpc = totalClicks > 0 ? round2(totalSpendUsd / totalClicks) : null;
  const avgCpm =
    totalImpressions > 0
      ? round2((totalSpendUsd / totalImpressions) * 1000)
      : null;

  // Platform-reported CPA — average across records that have it
  const cpaRecs = recs.filter((r) => r.cpa !== null && r.cpa > 0);
  const avgCpa =
    cpaRecs.length > 0
      ? round2(cpaRecs.reduce((sum, r) => sum + (r.cpa ?? 0), 0) / cpaRecs.length)
      : null;

  const dates = recs.map((r) => r.date).sort();
  const platforms = [...new Set(recs.map((r) => r.platform))];

  return {
    totalSpendUsd,
    totalImpressions,
    totalClicks,
    avgCtr,
    avgCpc,
    avgCpm,
    avgCpa,
    cpaNote: avgCpa !== null ? "Platform-reported CPA (Meta/Google attributed). Not verified customer conversions." : null,
    recordCount: recs.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    platforms,
    source,
  };
}

// ---------------------------------------------------------------------------
// Tool 2 — Get top campaigns
// ---------------------------------------------------------------------------

export function getTopCampaigns(
  recs: AdRecord[],
  sortBy: "spend" | "impressions" | "clicks" | "ctr",
  limit: number,
  source: SourceEnvelope = DEFAULT_SOURCE,
): {
  campaigns: Array<{
    campaignId: string;
    campaignName: string | null;
    platform: string;
    totalSpendUsd: number;
    totalImpressions: number;
    totalClicks: number;
    avgCtr: number | null;
    avgCpc: number | null;
    objective: string | null;
  }>;
  sortedBy: string;
  source: SourceEnvelope;
} {
  const byId = new Map<
    string,
    {
      campaignId: string;
      campaignName: string | null;
      platform: string;
      objective: string | null;
      spend: number;
      impressions: number;
      clicks: number;
    }
  >();

  for (const r of recs) {
    const existing = byId.get(r.campaignId);
    if (existing) {
      existing.spend += r.spendUsd;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
    } else {
      byId.set(r.campaignId, {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        platform: r.platform,
        objective: r.objective,
        spend: r.spendUsd,
        impressions: r.impressions,
        clicks: r.clicks,
      });
    }
  }

  const aggregated = [...byId.values()].map((c) => ({
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    platform: c.platform,
    totalSpendUsd: round2(c.spend),
    totalImpressions: c.impressions,
    totalClicks: c.clicks,
    avgCtr:
      c.impressions > 0 ? round2((c.clicks / c.impressions) * 100) : null,
    avgCpc: c.clicks > 0 ? round2(c.spend / c.clicks) : null,
    objective: c.objective,
  }));

  const sorted = aggregated.sort((a, b) => {
    if (sortBy === "spend") return b.totalSpendUsd - a.totalSpendUsd;
    if (sortBy === "impressions") return b.totalImpressions - a.totalImpressions;
    if (sortBy === "clicks") return b.totalClicks - a.totalClicks;
    if (sortBy === "ctr") return (b.avgCtr ?? 0) - (a.avgCtr ?? 0);
    return b.totalSpendUsd - a.totalSpendUsd;
  });

  return {
    campaigns: sorted.slice(0, limit),
    sortedBy: sortBy,
    source,
  };
}

// ---------------------------------------------------------------------------
// Tool 3 — Get market performance
// ---------------------------------------------------------------------------

export function getMarketPerformance(
  recs: AdRecord[],
  market: string,
  source: SourceEnvelope = DEFAULT_SOURCE,
): {
  found: boolean;
  market: string;
  matchedGeoId: string | null;
  totalSpendUsd: number;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number | null;
  avgCpc: number | null;
  campaignCount: number;
  campaigns: string[];
  source: SourceEnvelope;
} {
  const q = market.toLowerCase().replace(/_/gu, " ");
  const matched = recs.filter(
    (r) =>
      r.geoName?.toLowerCase().includes(q) ||
      r.campaignName?.toLowerCase().replace(/_/gu, " ").includes(q),
  );

  if (matched.length === 0) {
    return {
      found: false,
      market,
      matchedGeoId: null,
      totalSpendUsd: 0,
      totalImpressions: 0,
      totalClicks: 0,
      avgCtr: null,
      avgCpc: null,
      campaignCount: 0,
      campaigns: [],
      source,
    };
  }

  const totalSpendUsd = round2(matched.reduce((s, r) => s + r.spendUsd, 0));
  const totalImpressions = matched.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = matched.reduce((s, r) => s + r.clicks, 0);
  const avgCtr =
    totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : null;
  const avgCpc = totalClicks > 0 ? round2(totalSpendUsd / totalClicks) : null;
  const campaigns = [...new Set(matched.map((r) => r.campaignName).filter(Boolean))] as string[];
  const matchedGeoId = matched.find((r) => r.geoId)?.geoId ?? null;

  return {
    found: true,
    market,
    matchedGeoId,
    totalSpendUsd,
    totalImpressions,
    totalClicks,
    avgCtr,
    avgCpc,
    campaignCount: campaigns.length,
    campaigns: campaigns.slice(0, 10),
    source,
  };
}

// ---------------------------------------------------------------------------
// Tool 4 — Compare platforms
// ---------------------------------------------------------------------------

export function comparePlatforms(recs: AdRecord[], source: SourceEnvelope = DEFAULT_SOURCE): {
  platforms: Array<{
    platform: string;
    totalSpendUsd: number;
    totalImpressions: number;
    totalClicks: number;
    avgCtr: number | null;
    avgCpc: number | null;
    avgCpm: number | null;
    campaignCount: number;
  }>;
  availablePlatforms: string[];
  source: SourceEnvelope;
} {
  const grouped = new Map<
    string,
    { spend: number; impressions: number; clicks: number; campaigns: Set<string> }
  >();

  for (const r of recs) {
    const existing = grouped.get(r.platform);
    if (existing) {
      existing.spend += r.spendUsd;
      existing.impressions += r.impressions;
      existing.clicks += r.clicks;
      existing.campaigns.add(r.campaignId);
    } else {
      grouped.set(r.platform, {
        spend: r.spendUsd,
        impressions: r.impressions,
        clicks: r.clicks,
        campaigns: new Set([r.campaignId]),
      });
    }
  }

  const platforms = [...grouped.entries()].map(([platform, data]) => ({
    platform,
    totalSpendUsd: round2(data.spend),
    totalImpressions: data.impressions,
    totalClicks: data.clicks,
    avgCtr:
      data.impressions > 0
        ? round2((data.clicks / data.impressions) * 100)
        : null,
    avgCpc: data.clicks > 0 ? round2(data.spend / data.clicks) : null,
    avgCpm:
      data.impressions > 0
        ? round2((data.spend / data.impressions) * 1000)
        : null,
    campaignCount: data.campaigns.size,
  }));

  return {
    platforms,
    availablePlatforms: platforms.map((p) => p.platform),
    source,
  };
}

// ---------------------------------------------------------------------------
// Tool wrappers (read-only)
// ---------------------------------------------------------------------------

export const adPerformanceTools = {
  getPerformanceSummary: tool({
    description:
      "Get overall ad performance summary for XPAT: total spend, impressions, clicks, average CTR, CPC, CPM, CPA across all campaigns. Optionally filter by platform or date range. Read-only.",
    inputSchema: z.object({
      platform: z
        .enum(["Meta", "Google"])
        .optional()
        .describe("Filter to one platform. Omit for all platforms."),
      dateRange: z
        .enum(["last_7d", "last_30d", "all"])
        .optional()
        .describe("Date range filter. Defaults to all available data."),
    }),
    execute: async ({ platform, dateRange }) => {
      const { meta, data } = await loadArtifact();
      const source = buildSource(meta);
      const filtered = filterByPlatform(
        filterByDateRange(data.records, meta.generatedAt ?? new Date().toISOString(), dateRange),
        platform,
      );
      return summarizePerformance(filtered, source);
    },
  }),

  getTopCampaigns: tool({
    description:
      "Get XPAT's top performing campaigns ranked by spend, impressions, clicks, or CTR. Returns campaign name, platform, total spend, impressions, clicks, CTR, CPC. Read-only.",
    inputSchema: z.object({
      platform: z
        .enum(["Meta", "Google"])
        .optional()
        .describe("Filter to one platform. Omit for all platforms."),
      dateRange: z
        .enum(["last_7d", "last_30d", "all"])
        .optional()
        .describe("Date range filter. Defaults to all available data."),
      sortBy: z
        .enum(["spend", "impressions", "clicks", "ctr"])
        .optional()
        .describe("Metric to sort by. Defaults to spend."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of campaigns to return. Defaults to 5."),
    }),
    execute: async ({ platform, dateRange, sortBy = "spend", limit = 5 }) => {
      const { meta, data } = await loadArtifact();
      const source = buildSource(meta);
      const filtered = filterByPlatform(
        filterByDateRange(data.records, meta.generatedAt ?? new Date().toISOString(), dateRange),
        platform,
      );
      return getTopCampaigns(filtered, sortBy, limit, source);
    },
  }),

  getMarketPerformance: tool({
    description:
      "Get XPAT's ad performance for a specific US market or city. Matches by geo name or campaign name keywords. Returns total spend, impressions, clicks, CTR, CPC for that market. Read-only.",
    inputSchema: z.object({
      market: z
        .string()
        .describe(
          "US market name or city, e.g. 'Dallas', 'San Jose', 'Houston'. Also accepts partial names.",
        ),
      platform: z
        .enum(["Meta", "Google"])
        .optional()
        .describe("Filter to one platform. Omit for all platforms."),
    }),
    execute: async ({ market, platform }) => {
      const { meta, data } = await loadArtifact();
      const source = buildSource(meta);
      const filtered = filterByPlatform(data.records, platform);
      return getMarketPerformance(filtered, market, source);
    },
  }),

  comparePlatforms: tool({
    description:
      "Compare XPAT's ad performance across Meta and Google Ads side by side. Returns spend, impressions, clicks, CTR, CPC, CPM per platform. Read-only.",
    inputSchema: z.object({
      dateRange: z
        .enum(["last_7d", "last_30d", "all"])
        .optional()
        .describe("Date range filter. Defaults to all available data."),
    }),
    execute: async ({ dateRange }) => {
      const { meta, data } = await loadArtifact();
      const source = buildSource(meta);
      const filtered = filterByDateRange(data.records, meta.generatedAt ?? new Date().toISOString(), dateRange);
      return comparePlatforms(filtered, source);
    },
  }),
};

// ---------------------------------------------------------------------------
// Google Ads Intelligence artifact loader
// Reads data/artifacts/google-ads-intelligence.json (produced by
// pipeline/xpat-ads/fetch-google-ads-intelligence.mjs)
// ---------------------------------------------------------------------------

interface GadsIntelArtifact {
  meta: {
    family: string;
    source: string;
    generatedAt: string;
    lookbackDays: number;
    dateRange: { from: string; to: string };
    customerId: string;
    provenance: string;
    caveats: string[];
    errors: Array<{ query: string; message: string }>;
  };
  data: {
    accountSummary: {
      totalSpendUsd: number;
      totalClicks: number;
      totalImpressions: number;
      totalConversions: number;
      overallCtrPct: number | null;
      overallAvgCpcUsd: number | null;
      overallCostPerConversionUsd: number | null;
    };
    campaignRollup: Array<{
      campaignId: string;
      campaignName: string | null;
      campaignStatus: string | null;
      channelType: string | null;
      biddingStrategy: string | null;
      impressions: number;
      clicks: number;
      spendUsd: number;
      conversions: number;
      allConversions: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      costPerConversionUsd: number | null;
      activeDays: number;
    }>;
    campaignDailyRows: Array<{
      campaignId: string;
      campaignName: string | null;
      campaignStatus: string | null;
      channelType: string | null;
      adGroupId: string | null;
      adGroupName: string | null;
      date: string;
      impressions: number;
      clicks: number;
      spendUsd: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      conversions: number;
      allConversions: number;
    }>;
    keywordRollup: Array<{
      campaignId: string;
      campaignName: string | null;
      adGroupName: string | null;
      keyword: string | null;
      matchType: string | null;
      qualityScore: number | null;
      impressions: number;
      clicks: number;
      spendUsd: number;
      conversions: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      costPerConversionUsd: number | null;
      isWastedSpend: boolean;
      isHighCpc: boolean;
    }>;
    searchTermRollup: Array<{
      campaignId: string;
      campaignName: string | null;
      adGroupName: string | null;
      searchTerm: string | null;
      searchTermStatus: string | null;
      impressions: number;
      clicks: number;
      spendUsd: number;
      conversions: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      isLowIntent: boolean;
      isHighIntent: boolean;
      isWastedSpend: boolean;
    }>;
    adCopyRows: Array<{
      campaignId: string;
      campaignName: string | null;
      adGroupId: string | null;
      adGroupName: string | null;
      adId: string | null;
      adType: string | null;
      adStatus: string | null;
      adStrength: string | null;
      finalUrls: string | null;
      headline1: string | null;
      headline2: string | null;
      headline3: string | null;
      allHeadlines: string[] | null;
      description1: string | null;
      description2: string | null;
      impressions: number;
      clicks: number;
      spendUsd: number;
      ctrPct: number | null;
      conversions: number;
      costPerConversionUsd: number | null;
    }>;
    deviceRollup: Array<{
      device: string | null;
      impressions: number;
      clicks: number;
      spendUsd: number;
      conversions: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      costPerConversionUsd: number | null;
    }>;
    geoRollup: Array<{
      campaignId: string;
      campaignName: string | null;
      countryCriterionId: string | null;
      countryCode: string;
      impressions: number;
      clicks: number;
      spendUsd: number;
      conversions: number;
      ctrPct: number | null;
      avgCpcUsd: number | null;
      costPerConversionUsd: number | null;
    }>;
    conversionActions: Array<{
      conversionActionId: string | null;
      name: string | null;
      status: string | null;
      type: string | null;
      countingType: string | null;
      category: string | null;
      defaultValue: number | null;
      alwaysUseDefaultValue: boolean | null;
      includeInConversions: boolean | null;
    }>;
  };
}

let cachedGadsIntel: GadsIntelArtifact | null = null;

async function loadGadsIntelArtifact(): Promise<GadsIntelArtifact | null> {
  if (cachedGadsIntel) return cachedGadsIntel;
  try {
    const local = await import("@/data/artifacts/google-ads-intelligence.json");
    cachedGadsIntel = local.default as unknown as GadsIntelArtifact;
    return cachedGadsIntel;
  } catch {
    return null;
  }
}

function gadsSource(meta: GadsIntelArtifact["meta"]) {
  return {
    family: meta.family,
    label: meta.source,
    asOf: meta.generatedAt,
    provenance: meta.provenance,
    dateRange: meta.dateRange,
  };
}

// ---------------------------------------------------------------------------
// Google Ads Intelligence Tools
// ---------------------------------------------------------------------------

export const googleAdsIntelligenceTools = {

  /**
   * Account + campaign level summary — spend, clicks, impressions, CTR, CPC, conversions.
   * Answers: Q1-15, Q32-52 (DoD/WoW/MoM campaign questions), Q41-67.
   */
  getGoogleAdsCampaignSummary: tool({
    description:
      "Get Google Ads campaign-level performance rollup: spend, clicks, impressions, CTR, CPC, conversions for every campaign over the last 90 days. Use this to answer questions about which campaigns spent most, had best CTR, best cost-per-conversion, or zero conversions. Also returns account-level totals.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name to filter. Case insensitive. Omit for all campaigns."),
      sortBy: z
        .enum(["spend", "conversions", "ctr", "cpc", "costPerConversion"])
        .optional()
        .describe("Sort rollup by this metric. Defaults to spend."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max campaigns to return. Defaults to 20."),
      includeZeroConversions: z
        .boolean()
        .optional()
        .describe("If true, include campaigns with zero conversions. Defaults to true."),
    }),
    execute: async ({ campaignFilter, sortBy = "spend", limit = 20, includeZeroConversions = true }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let campaigns = artifact.data.campaignRollup;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        campaigns = campaigns.filter(c => c.campaignName?.toLowerCase().includes(q));
      }

      if (!includeZeroConversions) {
        campaigns = campaigns.filter(c => c.conversions > 0);
      }

      const sorted = [...campaigns].sort((a, b) => {
        if (sortBy === "spend") return b.spendUsd - a.spendUsd;
        if (sortBy === "conversions") return b.conversions - a.conversions;
        if (sortBy === "ctr") return (b.ctrPct ?? 0) - (a.ctrPct ?? 0);
        if (sortBy === "cpc") return (a.avgCpcUsd ?? 999) - (b.avgCpcUsd ?? 999);
        if (sortBy === "costPerConversion") return (a.costPerConversionUsd ?? 999999) - (b.costPerConversionUsd ?? 999999);
        return b.spendUsd - a.spendUsd;
      });

      return {
        found: true,
        accountSummary: artifact.data.accountSummary,
        campaigns: sorted.slice(0, limit).map(c => ({
          campaignName: c.campaignName,
          campaignStatus: c.campaignStatus,
          channelType: c.channelType,
          spendUsd: c.spendUsd,
          clicks: c.clicks,
          impressions: c.impressions,
          conversions: c.conversions,
          ctrPct: c.ctrPct,
          avgCpcUsd: c.avgCpcUsd,
          costPerConversionUsd: c.costPerConversionUsd,
          activeDays: c.activeDays,
          zeroConversions: c.conversions === 0,
        })),
        totalCampaigns: campaigns.length,
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Daily time-series for a campaign — for DoD, WoW, MoM analysis.
   * Answers: Q32-40 (DoD), Q41-52 (WoW), Q53-67 (MoM).
   */
  getGoogleAdsDailyTimeSeries: tool({
    description:
      "Get day-by-day Google Ads performance for one or all campaigns. Use for day-over-day (DoD), week-over-week (WoW), and month-over-month (MoM) comparisons. Returns date, spend, clicks, impressions, CTR, CPC, conversions per day.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name filter. Omit for all campaigns combined."),
      dateFrom: z
        .string()
        .optional()
        .describe("Start date YYYY-MM-DD. Omit for full available range."),
      dateTo: z
        .string()
        .optional()
        .describe("End date YYYY-MM-DD. Omit for full available range."),
      groupBy: z
        .enum(["day", "week", "month"])
        .optional()
        .describe("Aggregate by day, week (Mon-Sun), or calendar month. Defaults to day."),
    }),
    execute: async ({ campaignFilter, dateFrom, dateTo, groupBy = "day" }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let rows = artifact.data.campaignDailyRows;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        rows = rows.filter(r => r.campaignName?.toLowerCase().includes(q));
      }

      if (dateFrom) rows = rows.filter(r => r.date >= dateFrom);
      if (dateTo) rows = rows.filter(r => r.date <= dateTo);

      // Aggregate by period
      const periodKey = (date: string) => {
        if (groupBy === "month") return date.slice(0, 7); // YYYY-MM
        if (groupBy === "week") {
          const d = new Date(date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
          const mon = new Date(d.setDate(diff));
          return mon.toISOString().slice(0, 10);
        }
        return date;
      };

      const byPeriod = new Map<string, { spend: number; clicks: number; impressions: number; conversions: number }>();
      for (const r of rows) {
        const key = periodKey(r.date);
        const existing = byPeriod.get(key);
        if (existing) {
          existing.spend += r.spendUsd;
          existing.clicks += r.clicks;
          existing.impressions += r.impressions;
          existing.conversions += r.conversions;
        } else {
          byPeriod.set(key, {
            spend: r.spendUsd,
            clicks: r.clicks,
            impressions: r.impressions,
            conversions: r.conversions,
          });
        }
      }

      const series = [...byPeriod.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({
          period,
          spendUsd: Math.round(v.spend * 100) / 100,
          clicks: v.clicks,
          impressions: v.impressions,
          conversions: Math.round(v.conversions * 10) / 10,
          ctrPct: v.impressions > 0 ? Math.round(v.clicks / v.impressions * 10000) / 100 : null,
          avgCpcUsd: v.clicks > 0 ? Math.round(v.spend / v.clicks * 100) / 100 : null,
        }));

      return {
        found: series.length > 0,
        groupBy,
        campaignFilter: campaignFilter ?? "all",
        periods: series,
        totalPeriods: series.length,
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Keyword performance — which keywords are wasting money / driving conversions.
   * Answers: Meeting discussion about "transfer money to India" at $17 CPC 0 conversions.
   */
  getGoogleAdsKeywords: tool({
    description:
      "Get keyword-level performance from Google Ads: keyword text, match type, spend, clicks, conversions, CTR, CPC. Flags keywords with spend but zero conversions (wasted spend) and high-CPC keywords. Use to identify inefficient keywords or negative keyword candidates.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name to filter keywords. Omit for all campaigns."),
      filter: z
        .enum(["all", "wasted_spend", "zero_conversions", "high_cpc", "converting"])
        .optional()
        .describe("Filter keywords: wasted_spend = spend>$5 with 0 conversions, high_cpc = CPC>$10, converting = at least 1 conversion."),
      sortBy: z
        .enum(["spend", "cpc", "conversions", "ctr"])
        .optional()
        .describe("Sort by this metric. Defaults to spend."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max keywords to return. Defaults to 30."),
    }),
    execute: async ({ campaignFilter, filter = "all", sortBy = "spend", limit = 30 }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let keywords = artifact.data.keywordRollup;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        keywords = keywords.filter(k => k.campaignName?.toLowerCase().includes(q));
      }

      if (filter === "wasted_spend") keywords = keywords.filter(k => k.isWastedSpend);
      else if (filter === "zero_conversions") keywords = keywords.filter(k => k.conversions === 0);
      else if (filter === "high_cpc") keywords = keywords.filter(k => k.isHighCpc);
      else if (filter === "converting") keywords = keywords.filter(k => k.conversions > 0);

      const sorted = [...keywords].sort((a, b) => {
        if (sortBy === "spend") return b.spendUsd - a.spendUsd;
        if (sortBy === "cpc") return (b.avgCpcUsd ?? 0) - (a.avgCpcUsd ?? 0);
        if (sortBy === "conversions") return b.conversions - a.conversions;
        if (sortBy === "ctr") return (b.ctrPct ?? 0) - (a.ctrPct ?? 0);
        return b.spendUsd - a.spendUsd;
      });

      const totalWasted = keywords.filter(k => k.isWastedSpend).reduce((s, k) => s + k.spendUsd, 0);

      return {
        found: sorted.length > 0,
        filter,
        totalKeywords: keywords.length,
        totalWastedSpendUsd: Math.round(totalWasted * 100) / 100,
        keywords: sorted.slice(0, limit).map(k => ({
          keyword: k.keyword,
          matchType: k.matchType,
          campaignName: k.campaignName,
          adGroupName: k.adGroupName,
          spendUsd: k.spendUsd,
          clicks: k.clicks,
          impressions: k.impressions,
          conversions: k.conversions,
          ctrPct: k.ctrPct,
          avgCpcUsd: k.avgCpcUsd,
          costPerConversionUsd: k.costPerConversionUsd,
          qualityScore: k.qualityScore,
          isWastedSpend: k.isWastedSpend,
          isHighCpc: k.isHighCpc,
        })),
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Search term analysis — actual user queries that triggered ads.
   * Answers: questions about what users searched, low-intent irrelevant terms, negative keyword candidates.
   */
  getGoogleAdsSearchTerms: tool({
    description:
      "Get search terms (actual user queries) that triggered XPAT Google Ads. Shows which queries generated spend, clicks, and conversions. Flags low-intent terms (wasted impressions) and high-intent converting terms. Use to find negative keyword candidates.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name filter. Omit for all."),
      filter: z
        .enum(["all", "low_intent", "high_intent", "wasted_spend", "converting"])
        .optional()
        .describe("low_intent = <1% CTR with 0 conversions, high_intent = ≥10% CTR with conversions, wasted_spend = spend>$5 with 0 conversions."),
      sortBy: z
        .enum(["spend", "impressions", "conversions", "ctr"])
        .optional()
        .describe("Sort by metric. Defaults to spend."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max terms to return. Defaults to 30."),
    }),
    execute: async ({ campaignFilter, filter = "all", sortBy = "spend", limit = 30 }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let terms = artifact.data.searchTermRollup;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        terms = terms.filter(t => t.campaignName?.toLowerCase().includes(q));
      }

      if (filter === "low_intent") terms = terms.filter(t => t.isLowIntent);
      else if (filter === "high_intent") terms = terms.filter(t => t.isHighIntent);
      else if (filter === "wasted_spend") terms = terms.filter(t => t.isWastedSpend);
      else if (filter === "converting") terms = terms.filter(t => t.conversions > 0);

      const sorted = [...terms].sort((a, b) => {
        if (sortBy === "spend") return b.spendUsd - a.spendUsd;
        if (sortBy === "impressions") return b.impressions - a.impressions;
        if (sortBy === "conversions") return b.conversions - a.conversions;
        if (sortBy === "ctr") return (b.ctrPct ?? 0) - (a.ctrPct ?? 0);
        return b.spendUsd - a.spendUsd;
      });

      return {
        found: sorted.length > 0,
        filter,
        totalTerms: terms.length,
        terms: sorted.slice(0, limit).map(t => ({
          searchTerm: t.searchTerm,
          campaignName: t.campaignName,
          adGroupName: t.adGroupName,
          spendUsd: t.spendUsd,
          clicks: t.clicks,
          impressions: t.impressions,
          conversions: t.conversions,
          ctrPct: t.ctrPct,
          avgCpcUsd: t.avgCpcUsd,
          isLowIntent: t.isLowIntent,
          isHighIntent: t.isHighIntent,
          isWastedSpend: t.isWastedSpend,
        })),
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Ad copy performance — which headlines and descriptions drove clicks/conversions.
   * Answers: Q23-31 (ad-level questions).
   */
  getGoogleAdsAdCopy: tool({
    description:
      "Get ad copy performance from Google Ads: headlines, descriptions, ad strength, clicks, conversions, CTR per ad. Use to answer which ads generated the most clicks, signups, or lowest cost-per-conversion. Also shows which ads have high CTR but low conversion rate.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name filter. Omit for all."),
      sortBy: z
        .enum(["conversions", "clicks", "ctr", "spend"])
        .optional()
        .describe("Sort by metric. Defaults to conversions."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max ads to return. Defaults to 20."),
    }),
    execute: async ({ campaignFilter, sortBy = "conversions", limit = 20 }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let ads = artifact.data.adCopyRows;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        ads = ads.filter(a => a.campaignName?.toLowerCase().includes(q));
      }

      const sorted = [...ads].sort((a, b) => {
        if (sortBy === "conversions") return b.conversions - a.conversions;
        if (sortBy === "clicks") return b.clicks - a.clicks;
        if (sortBy === "ctr") return (b.ctrPct ?? 0) - (a.ctrPct ?? 0);
        if (sortBy === "spend") return b.spendUsd - a.spendUsd;
        return b.conversions - a.conversions;
      });

      return {
        found: sorted.length > 0,
        totalAds: ads.length,
        ads: sorted.slice(0, limit).map(a => ({
          campaignName: a.campaignName,
          adGroupName: a.adGroupName,
          adType: a.adType,
          adStatus: a.adStatus,
          adStrength: a.adStrength,
          headline1: a.headline1,
          headline2: a.headline2,
          headline3: a.headline3,
          allHeadlines: a.allHeadlines,
          description1: a.description1,
          description2: a.description2,
          finalUrls: a.finalUrls,
          impressions: a.impressions,
          clicks: a.clicks,
          spendUsd: a.spendUsd,
          ctrPct: a.ctrPct,
          conversions: a.conversions,
          costPerConversionUsd: a.costPerConversionUsd,
          highCtrLowConv: (a.ctrPct ?? 0) > 5 && a.conversions === 0,
        })),
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Device breakdown — mobile vs desktop vs tablet performance.
   */
  getGoogleAdsDeviceBreakdown: tool({
    description:
      "Get Google Ads performance broken down by device: mobile, desktop, tablet. Returns spend, clicks, impressions, CTR, CPC, conversions per device across all campaigns.",
    inputSchema: z.object({}),
    execute: async () => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      return {
        found: artifact.data.deviceRollup.length > 0,
        devices: artifact.data.deviceRollup,
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Geographic breakdown — which countries / regions the spend goes to.
   */
  getGoogleAdsGeoBreakdown: tool({
    description:
      "Get Google Ads performance by geography: spend, clicks, conversions, CTR per country. Returns country-level rollup across all campaigns.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .optional()
        .describe("Partial campaign name filter. Omit for all campaigns."),
    }),
    execute: async ({ campaignFilter }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let geo = artifact.data.geoRollup;

      if (campaignFilter) {
        const q = campaignFilter.toLowerCase();
        geo = geo.filter(g => g.campaignName?.toLowerCase().includes(q));
      }

      return {
        found: geo.length > 0,
        geoBreakdown: geo,
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Conversion actions registry — what conversion events are set up in Google Ads.
   * Answers: helps resolve the conversion/signup discrepancy question from the meeting.
   */
  getGoogleAdsConversionActions: tool({
    description:
      "List all conversion actions configured in Google Ads: name, type, counting method, category, and whether each is included in the conversions metric. Use to understand what events Google Ads counts as conversions and to investigate discrepancies between Google Ads conversions and actual signups.",
    inputSchema: z.object({
      includeDisabled: z
        .boolean()
        .optional()
        .describe("Include disabled/removed conversion actions. Defaults to false."),
    }),
    execute: async ({ includeDisabled = false }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      let actions = artifact.data.conversionActions;
      if (!includeDisabled) {
        actions = actions.filter(a => a.status !== "DISABLED" && a.status !== "REMOVED");
      }

      return {
        found: actions.length > 0,
        totalActions: actions.length,
        actions: actions.map(a => ({
          name: a.name,
          type: a.type,
          category: a.category,
          status: a.status,
          countingType: a.countingType,
          includeInConversions: a.includeInConversions,
          defaultValue: a.defaultValue,
        })),
        note: "Conversions in Google Ads only count actions marked as 'includeInConversions: true'. All other conversion events appear in 'all conversions' only.",
        source: gadsSource(artifact.meta),
      };
    },
  }),

  /**
   * Ad group level breakdown — for Q16-22.
   */
  getGoogleAdsAdGroupSummary: tool({
    description:
      "Get ad group level performance within a campaign: spend, clicks, impressions, CTR, CPC, conversions per ad group. Use to answer which ad groups generated the most signups, lowest cost-per-conversion, or spent money without conversions.",
    inputSchema: z.object({
      campaignFilter: z
        .string()
        .describe("Partial or full campaign name to look up. Required."),
      sortBy: z
        .enum(["spend", "conversions", "ctr", "cpc"])
        .optional()
        .describe("Sort by metric. Defaults to spend."),
    }),
    execute: async ({ campaignFilter, sortBy = "spend" }) => {
      const artifact = await loadGadsIntelArtifact();
      if (!artifact) return { found: false, reason: "Google Ads intelligence artifact not available." };

      const q = campaignFilter.toLowerCase();
      const rows = artifact.data.campaignDailyRows.filter(r =>
        r.campaignName?.toLowerCase().includes(q)
      );

      if (rows.length === 0) {
        return { found: false, campaignFilter, reason: "No ad group data found for that campaign name." };
      }

      // Aggregate by ad group
      const byAdGroup = new Map<string, {
        adGroupId: string; adGroupName: string | null; campaignName: string | null;
        impressions: number; clicks: number; spend: number; conversions: number;
      }>();

      for (const r of rows) {
        const key = r.adGroupId ?? "unknown";
        const existing = byAdGroup.get(key);
        if (existing) {
          existing.impressions += r.impressions;
          existing.clicks += r.clicks;
          existing.spend += r.spendUsd;
          existing.conversions += r.conversions;
        } else {
          byAdGroup.set(key, {
            adGroupId: r.adGroupId ?? "unknown",
            adGroupName: r.adGroupName,
            campaignName: r.campaignName,
            impressions: r.impressions,
            clicks: r.clicks,
            spend: r.spendUsd,
            conversions: r.conversions,
          });
        }
      }

      const adGroups = [...byAdGroup.values()].map(ag => ({
        adGroupName: ag.adGroupName,
        campaignName: ag.campaignName,
        spendUsd: Math.round(ag.spend * 100) / 100,
        clicks: ag.clicks,
        impressions: ag.impressions,
        conversions: Math.round(ag.conversions * 10) / 10,
        ctrPct: ag.impressions > 0 ? Math.round(ag.clicks / ag.impressions * 10000) / 100 : null,
        avgCpcUsd: ag.clicks > 0 ? Math.round(ag.spend / ag.clicks * 100) / 100 : null,
        costPerConversionUsd: ag.conversions > 0 ? Math.round(ag.spend / ag.conversions * 100) / 100 : null,
        zeroConversions: ag.conversions === 0,
        highCtrNoConv: (ag.clicks / Math.max(ag.impressions, 1)) > 0.05 && ag.conversions === 0,
      })).sort((a, b) => {
        if (sortBy === "spend") return b.spendUsd - a.spendUsd;
        if (sortBy === "conversions") return b.conversions - a.conversions;
        if (sortBy === "ctr") return (b.ctrPct ?? 0) - (a.ctrPct ?? 0);
        if (sortBy === "cpc") return (a.avgCpcUsd ?? 999) - (b.avgCpcUsd ?? 999);
        return b.spendUsd - a.spendUsd;
      });

      return {
        found: true,
        campaignFilter,
        adGroups,
        source: gadsSource(artifact.meta),
      };
    },
  }),
};
