/**
 * Server-side in-memory cache for generated market briefs. Keyed on the market
 * id plus the grounding source hash, so a cached brief is only reused while the
 * underlying evidence snapshot is unchanged. A new artifact snapshot changes the
 * hash and naturally invalidates the entry. Best-effort only: process memory is
 * fine here because committed demo briefs are the durable path.
 */

export type CachedBrief = {
  text: string;
  model: string;
  generatedAt: string;
  sourceHash: string;
};

const store = new Map<string, CachedBrief>();

function keyFor(marketId: string, sourceHash: string): string {
  return `${marketId}:${sourceHash}`;
}

export function getCachedBrief(
  marketId: string,
  sourceHash: string,
): CachedBrief | undefined {
  return store.get(keyFor(marketId, sourceHash));
}

export function setCachedBrief(marketId: string, brief: CachedBrief): void {
  store.set(keyFor(marketId, brief.sourceHash), brief);
}
