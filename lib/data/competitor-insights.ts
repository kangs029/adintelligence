import { quoteQuality } from "./fx-display";
import { providerOrder, type FxPayload, type FxProviderQuote } from "./fx";

export const POSITIONING_LANE_COPY =
  "Aspora and Crobo already press the Google-rate, zero-fee NRI lane. Xpat needs transparent rate proof plus India-first support evidence to stand apart.";
export const positioningLaneCopy = POSITIONING_LANE_COPY;

type ThemeRow = {
  count: number;
  examples?: unknown[];
  sharePct: number;
  theme: string;
};

type ThemeGroup = {
  averageRating?: number | null;
  competitor: string;
  sampleSize: number;
  store: "ios" | "android";
  themes: ThemeRow[];
  window: { from: string | null; to: string | null };
};

export type ReviewThemesInsightArtifact = {
  data: {
    groups: ThemeGroup[];
  };
  meta: {
    generatedAt: string;
  };
};

export type TodayPositionLine = {
  anchor: string;
  chip: "DERIVED";
  label: "Price" | "Reviews" | "Positioning";
  text: string;
};

export type ReviewGapInsight = {
  anchor: string;
  deltaPct: number;
  sentence: string;
  strongestProvider: string;
  strongestSampleSize: number;
  strongestSharePct: number;
  theme: string;
  weakestProvider: string;
  weakestSampleSize: number;
  weakestSharePct: number;
};

export type XpatReviewSignal = {
  caveat: "small sample";
  sampleSize: number;
  sentence: string;
  sharePct: number;
  theme: string;
};

export type AppPresenceSummary = {
  averageRating: number | null;
  countLabel: "window" | "lifetime";
  provider: string;
  reviewCount: number;
  reviewsPerMonth: number | null;
  window: { from: string | null; to: string | null };
};

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatThemePct(value: number) {
  return `${Math.round(value)}%`;
}

function formatReviewN(value: number) {
  return `n=${value.toLocaleString("en-US")}`;
}

function formatRupees(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function hasQuote(
  provider: FxProviderQuote,
): provider is FxProviderQuote & {
  effectiveMarginPctVsMid: number;
  receiveAmountFor1000USD: number;
} {
  return (
    provider.effectiveMarginPctVsMid !== null &&
    provider.receiveAmountFor1000USD !== null &&
    provider.quotedRate !== null
  );
}

function providerRank(provider: string) {
  const index = providerOrder.indexOf(provider as (typeof providerOrder)[number]);
  return index === -1 ? providerOrder.length : index;
}

function cleanQuotes(providers: readonly FxProviderQuote[]) {
  const quotes = providers.filter(hasQuote);
  const eligible = quotes.filter((provider) => quoteQuality(provider).eligibleForBest);
  return eligible.length > 0 ? eligible : quotes;
}

export function buildPriceVerdictLine(payload: FxPayload) {
  const quotes = cleanQuotes(payload.providers);

  if (quotes.length === 0) {
    return "No public quote rows are available yet. Xpat quote pending, see rate check.";
  }

  const closest = [...quotes].sort(
    (left, right) => left.effectiveMarginPctVsMid - right.effectiveMarginPctVsMid,
  )[0];
  const sortedByReceive = [...quotes].sort(
    (left, right) => right.receiveAmountFor1000USD - left.receiveAmountFor1000USD,
  );
  const best = sortedByReceive[0];
  const worst = sortedByReceive.at(-1) ?? best;
  const spread = Math.abs(best.receiveAmountFor1000USD - worst.receiveAmountFor1000USD);
  const xpatQuote = quotes.find((provider) => provider.provider === "Xpat");
  const rankSuffix = xpatQuote
    ? ` Xpat ranks ${
        sortedByReceive.findIndex((provider) => provider.provider === "Xpat") + 1
      } of ${quotes.length} quoted providers.`
    : " Xpat quote pending, see rate check.";

  return `${closest.provider} is closest to mid-market today at ${formatPct(
    closest.effectiveMarginPctVsMid,
  )}. Best to worst quote is a ${formatRupees(spread)} difference on $1,000.${rankSuffix}`;
}

function combinedGroups(groups: readonly ThemeGroup[]) {
  const byCompetitor = new Map<string, ThemeGroup[]>();

  for (const group of groups) {
    if (!byCompetitor.has(group.competitor)) byCompetitor.set(group.competitor, []);
    byCompetitor.get(group.competitor)?.push(group);
  }

  return [...byCompetitor.entries()]
    .map(([competitor, storeGroups]) => {
      const sampleSize = storeGroups.reduce((sum, group) => sum + group.sampleSize, 0);
      const themeNames = [
        ...new Set(storeGroups.flatMap((group) => group.themes.map((theme) => theme.theme))),
      ];
      const themes = themeNames.map((themeName) => {
        const rows = storeGroups.flatMap((group) =>
          group.themes.filter((theme) => theme.theme === themeName),
        );
        const count = rows.reduce((sum, row) => sum + row.count, 0);

        return {
          count,
          sharePct: sampleSize === 0 ? 0 : Math.round((count / sampleSize) * 1000) / 10,
          theme: themeName,
        };
      });
      const ratingTotal = storeGroups.reduce(
        (sum, group) => sum + (group.averageRating ?? 0) * group.sampleSize,
        0,
      );
      const ratingSample = storeGroups.reduce(
        (sum, group) =>
          sum + (group.averageRating === null || group.averageRating === undefined ? 0 : group.sampleSize),
        0,
      );
      const dates = storeGroups
        .flatMap((group) => [group.window.from, group.window.to])
        .filter(Boolean);
      const sortedDates = dates.sort();

      return {
        averageRating:
          ratingSample === 0 ? null : Math.round((ratingTotal / ratingSample) * 10) / 10,
        competitor,
        sampleSize,
        themes,
        window: {
          from: sortedDates[0] ?? null,
          to: sortedDates.at(-1) ?? null,
        },
      };
    })
    .sort((left, right) => providerRank(left.competitor) - providerRank(right.competitor));
}

function themeSentenceLabel(theme: string) {
  if (theme === "App bugs") return "app bugs";
  return theme.toLowerCase();
}

function reviewAnchor(theme: string) {
  return `#review-theme-${theme.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "")}`;
}

export function buildReviewGapInsights(artifact: ReviewThemesInsightArtifact) {
  const groups = combinedGroups(artifact.data.groups);
  const eligible = groups.filter((group) => group.competitor !== "Xpat" && group.sampleSize >= 100);
  const themes = [...new Set(eligible.flatMap((group) => group.themes.map((theme) => theme.theme)))];
  const gaps = themes
    .map((theme) => {
      const rows = eligible
        .map((group) => ({
          provider: group.competitor,
          sampleSize: group.sampleSize,
          sharePct: group.themes.find((row) => row.theme === theme)?.sharePct ?? 0,
        }))
        .sort((left, right) => right.sharePct - left.sharePct);
      const weakest = rows[0];
      const strongest = rows.at(-1);
      if (!weakest || !strongest) return undefined;

      return {
        anchor: reviewAnchor(theme),
        deltaPct: Math.round(weakest.sharePct - strongest.sharePct),
        sentence: `${weakest.provider} reviews mention ${themeSentenceLabel(theme)} at ${formatThemePct(
          weakest.sharePct,
        )} (${formatReviewN(weakest.sampleSize)}), versus ${formatThemePct(strongest.sharePct)} (${formatReviewN(strongest.sampleSize)}) for ${
          strongest.provider
        }. Treat this as a topic delta to inspect, not a sentiment score.`,
        strongestProvider: strongest.provider,
        strongestSampleSize: strongest.sampleSize,
        strongestSharePct: strongest.sharePct,
        theme,
        weakestProvider: weakest.provider,
        weakestSampleSize: weakest.sampleSize,
        weakestSharePct: weakest.sharePct,
      };
    })
    .filter((gap): gap is ReviewGapInsight => Boolean(gap))
    .sort((left, right) => right.deltaPct - left.deltaPct)
    .slice(0, 3);

  const xpat = groups.find((group) => group.competitor === "Xpat");
  const loudestXpatTheme = xpat?.themes.reduce<ThemeRow | undefined>(
    (best, theme) => (!best || theme.sharePct > best.sharePct ? theme : best),
    undefined,
  );
  const xpatSignal =
    xpat && loudestXpatTheme
      ? {
          caveat: "small sample" as const,
          sampleSize: xpat.sampleSize,
          sentence: `Xpat's own topic signal: mentions of ${themeSentenceLabel(loudestXpatTheme.theme)} appear in ${formatThemePct(
            loudestXpatTheme.sharePct,
          )} (${formatReviewN(xpat.sampleSize)}) of its lifetime reviews. Small sample, not a sentiment score.`,
          sharePct: loudestXpatTheme.sharePct,
          theme: loudestXpatTheme.theme,
        }
      : null;

  return { gaps, xpatSignal };
}

export function buildReviewVerdictLine(artifact: ReviewThemesInsightArtifact) {
  const groups = combinedGroups(artifact.data.groups).filter(
    (group) => group.competitor !== "Xpat" && group.sampleSize >= 100,
  );
  const top = groups
    .flatMap((group) =>
      group.themes.map((theme) => ({
        provider: group.competitor,
        sampleSize: group.sampleSize,
        sharePct: theme.sharePct,
        theme: theme.theme,
      })),
    )
    .sort((left, right) => right.sharePct - left.sharePct)[0];

  if (!top) return "Review topic deltas need more captured public reviews before naming a category comparison.";

  return `${top.theme} is the highest review topic for ${top.provider} at ${formatThemePct(
    top.sharePct,
  )} (${formatReviewN(top.sampleSize)}), based on keyword mentions, not sentiment.`;
}

export function buildTodayPosition({
  fxPayload,
  positioningLine,
  reviewArtifact,
}: {
  fxPayload: FxPayload;
  positioningLine: string;
  reviewArtifact: ReviewThemesInsightArtifact;
}): TodayPositionLine[] {
  return [
    {
      anchor: "#rate-table-title",
      chip: "DERIVED",
      label: "Price",
      text: buildPriceVerdictLine(fxPayload),
    },
    {
      anchor: "#review-themes-title",
      chip: "DERIVED",
      label: "Reviews",
      text: buildReviewVerdictLine(reviewArtifact),
    },
    {
      anchor: "#positioning-matrix-title",
      chip: "DERIVED",
      label: "Positioning",
      text: positioningLine,
    },
  ];
}

function monthsBetween(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.max(1, (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return days / 30.44;
}

export function buildAppPresenceSummaries(
  artifact: ReviewThemesInsightArtifact,
): AppPresenceSummary[] {
  return combinedGroups(artifact.data.groups).map((group) => {
    const months = monthsBetween(group.window.from, group.window.to);
    return {
      averageRating: group.averageRating,
      countLabel: group.competitor === "Xpat" ? "lifetime" : "window",
      provider: group.competitor,
      reviewCount: group.sampleSize,
      reviewsPerMonth: months === null ? null : Math.round(group.sampleSize / months),
      window: group.window,
    };
  });
}
