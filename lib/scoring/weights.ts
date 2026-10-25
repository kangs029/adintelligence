export const MARKET_SCORE_WEIGHTS = {
  population: 0.35,
  concentration: 0.2,
  anchors: 0.2,
  employment: 0.15,
  students: 0.1,
} as const;

export const MARKET_SCORE_CAPS = {
  asianIndianPopulation: 250_000,
  multipleOfUS: 5,
  anchorsPer10kAI: 3,
  lcaFilingsPer10kAI: 40,
  activeIndianStudents: 15_000,
} as const;

export const MARKET_TIER_THRESHOLDS = {
  tier1Score: 70,
  tier2Score: 52,
  tier3Score: 25,
  tier1MinAnchors: 5,
} as const;
