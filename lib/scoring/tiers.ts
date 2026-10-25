import type { Market } from "@/lib/data/markets";

import { scoreMarket } from "./score";
import { MARKET_TIER_THRESHOLDS } from "./weights";

export type MarketTier = 1 | 2 | 3 | 4;

interface TierInput {
  score: number;
  market: Market;
}

function anchorCount(market: Market) {
  return (
    (market.anchorSummary?.temples ?? 0) +
    (market.anchorSummary?.groceries ?? 0) +
    (market.anchorSummary?.cricket ?? 0) +
    (market.anchorSummary?.theaters ?? 0)
  );
}

export function tierMarket({ score, market }: TierInput): MarketTier {
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

export function scoreAndTierMarket(market: Market): Market & { score: number; tier: MarketTier } {
  const { score } = scoreMarket(market);
  return {
    ...market,
    score,
    tier: tierMarket({ score, market }),
  };
}
