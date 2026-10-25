import type { MarketsGeoJson } from "./MapCanvas";
import type { StatTileProps } from "@/components/shell/StatTile";

export type AnchorKind = "temples" | "groceries" | "cricket" | "theaters";

export interface MarketFilters {
  tiers: number[];
  showAuditInventory: boolean;
  state: string;
  minAsianIndian: number;
  anchorKinds: AnchorKind[];
  surprisePockets: boolean;
}

export function defaultMarketFilters(): MarketFilters {
  return {
    tiers: [1, 2, 3],
    showAuditInventory: false,
    state: "ALL",
    minAsianIndian: 0,
    anchorKinds: ["temples", "groceries", "cricket"],
    surprisePockets: false,
  };
}

const tierNoticeLabels: Record<number, string> = {
  1: "launch-planning",
  2: "growth",
  3: "discovery",
  4: "audit-hold",
};

function topMetroGeoids(markets: MarketsGeoJson) {
  return new Set(
    [...markets.features]
      .sort((left, right) => right.properties.asianIndian - left.properties.asianIndian)
      .slice(0, 10)
      .map((feature) => feature.properties.geoid),
  );
}

export function filterMarketFeatures(markets: MarketsGeoJson, filters: MarketFilters) {
  const top10 = topMetroGeoids(markets);

  return markets.features.filter((feature) => {
    const market = feature.properties;
    const tiers = filters.surprisePockets ? [2, 3] : filters.tiers;

    if (market.tier === 4 && !filters.showAuditInventory) return false;
    if (!tiers.includes(market.tier)) return false;
    if (filters.state !== "ALL" && !market.states.includes(filters.state)) return false;
    if (market.asianIndian < filters.minAsianIndian) return false;

    if (filters.surprisePockets) {
      return market.multipleOfUS >= 3 && !top10.has(market.geoid);
    }

    return true;
  });
}

export type HiddenPopulationNotice = {
  count: number;
  message: string;
};

function hiddenPopulationMessage(count: number, tiers: number[]) {
  const marketWord = count === 1 ? "market" : "markets";

  if (tiers.length === 1) {
    return `${count} ${tierNoticeLabels[tiers[0]] ?? "selected-tier"} ${marketWord} hidden by the population filter.`;
  }

  return `${count} ${marketWord} in selected tiers hidden by the population filter.`;
}

export function hiddenPopulationNotice(
  markets: MarketsGeoJson,
  filters: MarketFilters,
): HiddenPopulationNotice | undefined {
  if (filters.minAsianIndian <= 0) return undefined;

  const visibleAtCurrentPopulation = new Set(
    filterMarketFeatures(markets, filters).map((feature) => feature.properties.geoid),
  );
  const withoutPopulationFilter = filterMarketFeatures(markets, {
    ...filters,
    minAsianIndian: 0,
  });
  const hiddenFeatures = withoutPopulationFilter.filter(
    (feature) =>
      feature.properties.asianIndian < filters.minAsianIndian &&
      !visibleAtCurrentPopulation.has(feature.properties.geoid),
  );

  if (hiddenFeatures.length === 0) return undefined;

  const hiddenTiers = [...new Set(hiddenFeatures.map((feature) => feature.properties.tier))].sort(
    (left, right) => left - right,
  );

  return {
    count: hiddenFeatures.length,
    message: hiddenPopulationMessage(hiddenFeatures.length, hiddenTiers),
  };
}

function compactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function releaseValue(release: string) {
  return release.replace(" 5-year", "");
}

function releaseDetail(release: string) {
  return release.includes("5-year") ? "5-year CBSA table" : "CBSA table";
}

export function marketMapKpis({
  markets,
  release,
}: {
  markets: MarketsGeoJson;
  release: string;
}): StatTileProps[] {
  const totalAsianIndian = markets.features.reduce(
    (total, feature) => total + feature.properties.asianIndian,
    0,
  );
  const totalAnchors = markets.features.reduce(
    (total, feature) => total + feature.properties.anchorCount,
    0,
  );
  const launchPlanningMarkets = markets.features.filter(
    (feature) => feature.properties.tier === 1,
  ).length;

  return [
    {
      label: "Launch-planning markets",
      value: new Intl.NumberFormat("en-US").format(launchPlanningMarkets),
      detail: "Tier 1 evidence set",
    },
    {
      label: "Markets tracked",
      value: new Intl.NumberFormat("en-US").format(markets.features.length),
      detail: "ACS CBSAs in scope",
    },
    {
      label: "AI population covered",
      value: compactNumber(totalAsianIndian),
      detail: "Asian Indian estimate",
    },
    {
      label: "Community anchors",
      value: new Intl.NumberFormat("en-US").format(totalAnchors),
      detail: "mapped evidence rows",
    },
    {
      label: "Data release",
      value: releaseValue(release),
      detail: releaseDetail(release),
    },
  ];
}

export function availableStates(markets: MarketsGeoJson) {
  return [...new Set(markets.features.flatMap((feature) => feature.properties.states))].sort();
}
