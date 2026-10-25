import type { Market } from "@/lib/data/markets";

export type MarketFeatureKey =
  | "anchorDensity"
  | "anchorMix"
  | "concentration"
  | "cricket"
  | "groceries"
  | "income"
  | "lcaDensity"
  | "lcaVolume"
  | "population"
  | "studentShare"
  | "studentVolume"
  | "temples"
  | "theaters";

export type FitWeights = Partial<Record<MarketFeatureKey, number>>;

export type PersonaDefinition = {
  id: string;
  name: string;
  description: string;
  signals: string[];
  evidenceRequirements: string[];
  messageAngles: string[];
  complianceNotes: string[];
  fitWeights: FitWeights;
};

export type ChannelDefinition = {
  id: string;
  name: string;
  whenFits: string;
  evidenceToCheck: string[];
  benchmarkReferenceMarket: string;
  measurementPath: string;
  suggestedTestBudgetEstimate: string;
  successMetric: string;
  fitWeights: FitWeights;
};

export type FitContribution = {
  feature: MarketFeatureKey;
  label: string;
  value: number;
  weightedPoints: number;
};

export type PersonaFit = {
  confidence: "high" | "medium" | "exploratory";
  contributions: FitContribution[];
  marketGeoid: string;
  personaId: string;
  score: number;
};

export type ChannelFit = ChannelDefinition & {
  contributions: FitContribution[];
  marketGeoid: string;
  reasons: string[];
  score: number;
};

const featureLabels: Record<MarketFeatureKey, string> = {
  anchorDensity: "Community place density",
  anchorMix: "Community place mix",
  concentration: "Concentration",
  cricket: "Cricket",
  groceries: "Groceries",
  income: "Income",
  lcaDensity: "H-1B employer filing density",
  lcaVolume: "H-1B employer filing volume",
  population: "Population",
  studentShare: "Student share",
  studentVolume: "Student volume",
  temples: "Temples",
  theaters: "Theaters",
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function marketFeatureVector(market: Market): Record<MarketFeatureKey, number> {
  const asianIndian = Math.max(1, market.population.asianIndian);
  const anchors = market.anchorSummary;
  const employment = market.employmentProxy;
  const students = market.students;
  const income = market.income?.medianHousehold ?? 0;
  const anchorKinds = anchors
    ? [anchors.temples, anchors.groceries, anchors.cricket, anchors.theaters].filter((count) => count > 0).length
    : 0;

  return {
    anchorDensity: clamp01((anchors?.per10kAI ?? 0) / 3),
    anchorMix: clamp01(anchorKinds / 4),
    concentration: clamp01(market.concentration.multipleOfUS / 5),
    cricket: clamp01((anchors?.cricket ?? 0) / 8),
    groceries: clamp01((anchors?.groceries ?? 0) / 20),
    income: clamp01((income - 65_000) / 90_000),
    lcaDensity: clamp01(((employment?.lcaFilings ?? 0) / asianIndian) / 0.08),
    lcaVolume: clamp01((employment?.lcaFilings ?? 0) / 20_000),
    population: clamp01(Math.log10(asianIndian + 1) / Math.log10(300_000)),
    studentShare: clamp01(((students?.activeIndianStudents ?? 0) / asianIndian) / 0.12),
    studentVolume: clamp01((students?.activeIndianStudents ?? 0) / 15_000),
    temples: clamp01((anchors?.temples ?? 0) / 12),
    theaters: clamp01((anchors?.theaters ?? 0) / 6),
  };
}

function scoreWithWeights(market: Market, weights: FitWeights) {
  const features = marketFeatureVector(market);
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + (weight ?? 0), 0) || 1;
  const contributions = Object.entries(weights)
    .map(([feature, weight]) => {
      const typedFeature = feature as MarketFeatureKey;
      const normalizedWeight = (weight ?? 0) / totalWeight;
      const weightedPoints = features[typedFeature] * normalizedWeight * 100;

      return {
        feature: typedFeature,
        label: featureLabels[typedFeature],
        value: rounded(features[typedFeature]),
        weightedPoints: rounded(weightedPoints),
      };
    })
    .filter((contribution) => contribution.weightedPoints > 0)
    .sort((left, right) => right.weightedPoints - left.weightedPoints);
  const score = rounded(contributions.reduce((sum, contribution) => sum + contribution.weightedPoints, 0));

  return { contributions, score };
}

function confidenceFor(score: number, contributions: FitContribution[]) {
  if (score >= 75 && contributions.length >= 2) return "high";
  if (score >= 50 && contributions.length >= 2) return "medium";
  return "exploratory";
}

export function scorePersonaForMarket(market: Market, persona: PersonaDefinition): PersonaFit {
  const result = scoreWithWeights(market, persona.fitWeights);

  return {
    confidence: confidenceFor(result.score, result.contributions),
    contributions: result.contributions,
    marketGeoid: market.geoid,
    personaId: persona.id,
    score: result.score,
  };
}

export function rankChannelsForMarket(
  market: Market,
  channels: ChannelDefinition[],
): ChannelFit[] {
  return channels
    .map((channel) => {
      const result = scoreWithWeights(market, channel.fitWeights);
      const contributions = result.contributions;

      return {
        ...channel,
        contributions,
        marketGeoid: market.geoid,
        reasons: contributions.slice(0, 3).map((contribution) => contribution.label),
        score: result.score,
      };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}
