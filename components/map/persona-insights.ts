type AnchorSummary = {
  temples: number;
  groceries: number;
  cricket: number;
  theaters?: number;
};

type MarketLike = {
  geoid: string;
  tier: number;
  population?: { asianIndian?: number };
  anchorSummary?: AnchorSummary;
};

export type CinemaPersonaInput = {
  theaterSignalCount: number;
  languageCounts: Record<string, number>;
};

export type PersonaInsightLine = {
  href: string;
  text: string;
};

type AnchorMetric = {
  key: keyof AnchorSummary;
  label: string;
  persona: string;
};

const ANCHOR_METRICS: AnchorMetric[] = [
  {
    key: "temples",
    label: "Temple",
    persona: "settled family",
  },
  {
    key: "groceries",
    label: "Grocery",
    persona: "family remitter",
  },
  {
    key: "cricket",
    label: "Cricket",
    persona: "young professional",
  },
];

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).toSorted((a, b) => a - b);
  if (sorted.length === 0) return 0;

  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint] ?? 0;
  }

  return ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
}

function densityPer10k(count = 0, population = 0) {
  return population > 0 ? (count / population) * 10_000 : 0;
}

function tierBenchmarkMarkets(markets: MarketLike[]) {
  return markets.filter((market) => market.tier === 1 || market.tier === 2);
}

function topLanguage(languageCounts: Record<string, number>) {
  return Object.entries(languageCounts)
    .filter(([, count]) => count > 0)
    .sort(([leftLanguage, leftCount], [rightLanguage, rightCount]) => {
      const countOrder = rightCount - leftCount;
      return countOrder || leftLanguage.localeCompare(rightLanguage);
    })[0]?.[0];
}

function anchorInsightCandidates({
  market,
  benchmarkMarkets,
  href,
}: {
  market: MarketLike;
  benchmarkMarkets: MarketLike[];
  href: string;
}) {
  const population = market.population?.asianIndian ?? 0;

  return ANCHOR_METRICS.flatMap((metric) => {
    const marketDensity = densityPer10k(market.anchorSummary?.[metric.key] ?? 0, population);
    const benchmarkMedian = median(
      tierBenchmarkMarkets(benchmarkMarkets).map((benchmarkMarket) =>
        densityPer10k(
          benchmarkMarket.anchorSummary?.[metric.key] ?? 0,
          benchmarkMarket.population?.asianIndian ?? 0,
        ),
      ),
    );

    if (marketDensity <= 0 || benchmarkMedian <= 0) {
      return [];
    }

    const ratio = marketDensity / benchmarkMedian;
    if (ratio + Number.EPSILON < 1.5) {
      return [];
    }

    return [
      {
        href,
        ratio,
        text: `${metric.label} density ${ratio.toFixed(
          1,
        )}x the Tier 1/2 median. Evidence for the ${metric.persona} persona.`,
      },
    ];
  }).sort((left, right) => right.ratio - left.ratio);
}

export function buildPersonaInsightLines({
  market,
  benchmarkMarkets,
  cinema,
}: {
  market: MarketLike;
  benchmarkMarkets: MarketLike[];
  cinema: CinemaPersonaInput;
}): PersonaInsightLine[] {
  const href = `/playbook?market=${market.geoid}#personas`;
  const anchorLines = anchorInsightCandidates({ market, benchmarkMarkets, href });
  const language = cinema.theaterSignalCount > 0 ? topLanguage(cinema.languageCounts) : undefined;
  const languageLine = language
    ? {
        href,
        text: `${language}-first cinema footprint. Evidence for the ${language} family persona.`,
      }
    : undefined;

  const lines = [
    ...anchorLines.slice(0, 1),
    ...(languageLine ? [languageLine] : []),
    ...anchorLines.slice(1),
  ];

  return lines.slice(0, 3).map(({ href: lineHref, text }) => ({
    href: lineHref,
    text,
  }));
}
