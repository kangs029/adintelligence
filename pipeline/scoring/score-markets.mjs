export const MARKET_SCORE_WEIGHTS = {
  population: 0.35,
  concentration: 0.2,
  anchors: 0.2,
  employment: 0.15,
  students: 0.1,
};

export const MARKET_SCORE_CAPS = {
  asianIndianPopulation: 250_000,
  multipleOfUS: 5,
  anchorsPer10kAI: 3,
  lcaFilingsPer10kAI: 40,
  activeIndianStudents: 15_000,
};

export const MARKET_TIER_THRESHOLDS = {
  tier1Score: 70,
  tier2Score: 52,
  tier3Score: 25,
  tier1MinAnchors: 5,
};

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value) {
  if (Number.isNaN(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function cappedLinear(value, cap) {
  return clamp01((value ?? 0) / cap);
}

function cappedLog(value, cap) {
  return clamp01(Math.log1p(value) / Math.log1p(cap));
}

function anchorCount(market) {
  return (
    (market.anchorSummary?.temples ?? 0) +
    (market.anchorSummary?.groceries ?? 0) +
    (market.anchorSummary?.cricket ?? 0) +
    (market.anchorSummary?.theaters ?? 0)
  );
}

function anchorDensity(market) {
  if (market.anchorSummary?.per10kAI !== undefined) {
    return market.anchorSummary.per10kAI;
  }

  if (market.population.asianIndian <= 0) {
    return 0;
  }

  return (anchorCount(market) / market.population.asianIndian) * 10_000;
}

function employmentDensity(market) {
  if (!market.employmentProxy || market.population.asianIndian <= 0) {
    return 0;
  }

  return (market.employmentProxy.lcaFilings / market.population.asianIndian) * 10_000;
}

function weightedComponents(components) {
  return {
    population: round(components.population * MARKET_SCORE_WEIGHTS.population * 100),
    concentration: round(components.concentration * MARKET_SCORE_WEIGHTS.concentration * 100),
    anchors: round(components.anchors * MARKET_SCORE_WEIGHTS.anchors * 100),
    employment: round(components.employment * MARKET_SCORE_WEIGHTS.employment * 100),
    students: round(components.students * MARKET_SCORE_WEIGHTS.students * 100),
  };
}

export function scoreMarketRecord(market) {
  const components = {
    population: cappedLog(
      market.population.asianIndian,
      MARKET_SCORE_CAPS.asianIndianPopulation,
    ),
    concentration: cappedLinear(
      market.concentration.multipleOfUS,
      MARKET_SCORE_CAPS.multipleOfUS,
    ),
    anchors: cappedLinear(anchorDensity(market), MARKET_SCORE_CAPS.anchorsPer10kAI),
    employment: cappedLinear(
      employmentDensity(market),
      MARKET_SCORE_CAPS.lcaFilingsPer10kAI,
    ),
    students: cappedLinear(
      market.students?.activeIndianStudents,
      MARKET_SCORE_CAPS.activeIndianStudents,
    ),
  };
  const weighted = weightedComponents(components);

  return {
    score: round(Object.values(weighted).reduce((total, value) => total + value, 0)),
    components,
    weighted,
  };
}

export function tierMarketRecord({ score, market }) {
  if (
    score >= MARKET_TIER_THRESHOLDS.tier1Score &&
    market.moeReliability === "high" &&
    anchorCount(market) >= MARKET_TIER_THRESHOLDS.tier1MinAnchors
  ) {
    return 1;
  }

  if (score >= MARKET_TIER_THRESHOLDS.tier2Score && market.moeReliability !== "low") {
    return 2;
  }

  if (score >= MARKET_TIER_THRESHOLDS.tier3Score) {
    return 3;
  }

  return 4;
}

export function scoreAndTierMarketRecord(market) {
  const { score } = scoreMarketRecord(market);
  return {
    ...market,
    score,
    tier: tierMarketRecord({ score, market }),
  };
}

export function scoreAndTierMarkets(markets) {
  return markets.map(scoreAndTierMarketRecord);
}
