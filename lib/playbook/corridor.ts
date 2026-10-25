import type { Market } from "@/lib/data/markets";

export type CorridorContextData = {
  indiaInboundRemittances: {
    amountUsd: number;
    sourceLabel: string;
    sourceUrl: string;
    year: number;
  };
  method: string;
  rounding: string;
  usShare: {
    sourceLabel: string;
    sourceUrl: string;
    valuePct: number;
    yearLabel: string;
  };
};

export type MarketCorridorContext = {
  estimateLabel: string;
  estimateUsd: number | null;
  method: string;
  sourceLinks: Array<{ href: string; label: string }>;
  usCorridorEstimateUsd: number | null;
};

function formatUsdEstimate(value: number) {
  if (value >= 1_000_000_000) {
    const rounded = Math.round(value / 100_000_000) / 10;
    return `$${rounded.toFixed(1)}B a year`;
  }

  if (value < 5_000_000) {
    return "<$10M a year";
  }

  const roundedMillions =
    value >= 100_000_000
      ? Math.round(value / 100_000_000) * 100
      : Math.max(10, Math.round(value / 10_000_000) * 10);
  return `$${roundedMillions}M a year`;
}

export function corridorContextForMarket({
  context,
  market,
  nationalAsianIndian,
}: {
  context: CorridorContextData | null;
  market: Market;
  nationalAsianIndian: number;
}): MarketCorridorContext {
  if (!context) {
    return {
      estimateLabel: "Connector needed",
      estimateUsd: null,
      method:
        "Corridor context source fetch failed. Rerun the playbook-context pipeline before using this estimate.",
      sourceLinks: [],
      usCorridorEstimateUsd: null,
    };
  }

  const usCorridorEstimateUsd = context.indiaInboundRemittances.amountUsd * (context.usShare.valuePct / 100);
  const estimateUsd = usCorridorEstimateUsd * (market.population.asianIndian / nationalAsianIndian);

  return {
    estimateLabel: formatUsdEstimate(estimateUsd),
    estimateUsd,
    method: `${context.method} Display uses the rounding rule: ${context.rounding}`,
    sourceLinks: [
      {
        href: context.indiaInboundRemittances.sourceUrl,
        label: `${context.indiaInboundRemittances.year} World Bank remittances`,
      },
      {
        href: context.usShare.sourceUrl,
        label: `${context.usShare.yearLabel} US share source`,
      },
    ],
    usCorridorEstimateUsd,
  };
}
