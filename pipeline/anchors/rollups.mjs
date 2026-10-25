import { scoreAndTierMarkets } from "../scoring/score-markets.mjs";

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emptyRollup() {
  return {
    temples: 0,
    groceries: 0,
    cricket: 0,
    theaters: 0,
    per10kAI: 0,
  };
}

function incrementRollup(rollup, kind) {
  if (kind === "temple") {
    rollup.temples += 1;
  }
  if (kind === "grocery") {
    rollup.groceries += 1;
  }
  if (kind === "cricket") {
    rollup.cricket += 1;
  }
  if (kind === "theater") {
    rollup.theaters += 1;
  }
}

function totalAnchors(rollup) {
  return rollup.temples + rollup.groceries + rollup.cricket + rollup.theaters;
}

export function rollupAnchorsByMarket({ anchors, markets }) {
  const rollups = {};
  const marketByGeoid = new Map(markets.map((market) => [market.geoid, market]));

  for (const anchor of anchors) {
    rollups[anchor.marketGeoid] ??= emptyRollup();
    incrementRollup(rollups[anchor.marketGeoid], anchor.kind);
  }

  for (const [marketGeoid, rollup] of Object.entries(rollups)) {
    const market = marketByGeoid.get(marketGeoid);
    const asianIndianPopulation = market?.population?.asianIndian ?? 0;
    rollup.per10kAI =
      asianIndianPopulation > 0 ? round((totalAnchors(rollup) / asianIndianPopulation) * 10_000) : 0;
  }

  return Object.fromEntries(Object.entries(rollups).sort(([left], [right]) => left.localeCompare(right)));
}

export function mergeAnchorRollupsIntoMarkets({ marketsArtifact, anchors, marketRollups }) {
  const rollups =
    marketRollups ??
    rollupAnchorsByMarket({
      anchors,
      markets: marketsArtifact.data.markets,
    });
  const marketsWithRollups = marketsArtifact.data.markets.map((market) => ({
    ...market,
    anchorSummary: rollups[market.geoid] ?? emptyRollup(),
  }));

  return {
    ...marketsArtifact,
    meta: {
      ...marketsArtifact.meta,
      provenance: "derived",
      method: `${marketsArtifact.meta.method}; anchor rollups merged from anchors artifact.`,
      caveats: [
        ...marketsArtifact.meta.caveats,
        "Anchor counts reflect OpenStreetMap coverage and QA rules.",
      ],
    },
    data: {
      ...marketsArtifact.data,
      markets: scoreAndTierMarkets(marketsWithRollups),
    },
  };
}
