import marketBriefsArtifact from "@/data/artifacts/market-briefs.json";

/**
 * A committed, pre-generated demo brief. These are the durable, sanitized briefs
 * for the pinned demo markets, rendered instantly with no live model call so the
 * demo is deterministic and offline-safe.
 */
export type DemoBrief = {
  marketName: string;
  sourceHash: string;
  generatedAt: string;
  text: string;
};

const briefs = marketBriefsArtifact.data.briefs as Record<string, DemoBrief>;

export const marketBriefsModel = marketBriefsArtifact.meta.model;
export const marketBriefsGeneratedAt = marketBriefsArtifact.meta.generatedAt;

export function getDemoBrief(marketId: string | undefined): DemoBrief | null {
  if (!marketId) {
    return null;
  }
  return briefs[marketId] ?? null;
}

export function hasDemoBrief(marketId: string | undefined): boolean {
  return getDemoBrief(marketId) !== null;
}
