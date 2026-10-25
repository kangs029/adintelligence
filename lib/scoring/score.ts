import type { Market } from "@/lib/data/markets";

import { MARKET_SCORE_CAPS, MARKET_SCORE_WEIGHTS } from "./weights";

export interface ScoreComponents {
  population: number;
  concentration: number;
  anchors: number;
  employment: number;
  students: number;
}

export interface MarketScore {
  score: number;
  components: ScoreComponents;
  weighted: ScoreComponents;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number) {
  if (Number.isNaN(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function cappedLinear(value: number | undefined, cap: number) {
  return clamp01((value ?? 0) / cap);
}

function cappedLog(value: number, cap: number) {
  return clamp01(Math.log1p(value) / Math.log1p(cap));
}

function anchorDensity(market: Market) {
  if (market.anchorSummary?.per10kAI !== undefined) {
    return market.anchorSummary.per10kAI;
  }

  const anchors =
    (market.anchorSummary?.temples ?? 0) +
    (market.anchorSummary?.groceries ?? 0) +
    (market.anchorSummary?.cricket ?? 0) +
    (market.anchorSummary?.theaters ?? 0);

  if (market.population.asianIndian <= 0) {
    return 0;
  }

  return (anchors / market.population.asianIndian) * 10_000;
}

function employmentDensity(market: Market) {
  if (!market.employmentProxy || market.population.asianIndian <= 0) {
    return 0;
  }

  return (market.employmentProxy.lcaFilings / market.population.asianIndian) * 10_000;
}

function weightedComponents(components: ScoreComponents): ScoreComponents {
  return {
    population: round(components.population * MARKET_SCORE_WEIGHTS.population * 100),
    concentration: round(components.concentration * MARKET_SCORE_WEIGHTS.concentration * 100),
    anchors: round(components.anchors * MARKET_SCORE_WEIGHTS.anchors * 100),
    employment: round(components.employment * MARKET_SCORE_WEIGHTS.employment * 100),
    students: round(components.students * MARKET_SCORE_WEIGHTS.students * 100),
  };
}

export function scoreMarket(market: Market): MarketScore {
  const components: ScoreComponents = {
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
