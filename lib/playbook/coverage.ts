import type { Market } from "@/lib/data/markets";
import type { AdsImportResult, MappedMarketPerformance } from "./ads-import";
import { MIN_CONVERSIONS_FOR_TRUST } from "./ads-import";

export type ProofGateStatus = "already-covered" | "confirmed-gap" | "insufficient-data" | "not-uploaded";

export type MarketCoverage = {
  costUsd: number | null;
  firstTransfers: number;
  hasFirstTransferEvidence: boolean;
  impressions: number | null;
  label: string;
  marketGeoid: string;
  rowCount: number;
  status: ProofGateStatus;
  trustedFloor: number;
};

function coverageLabel(status: ProofGateStatus) {
  if (status === "already-covered") return "already covered";
  if (status === "confirmed-gap") return "confirmed gap";
  if (status === "insufficient-data") return "insufficient data";
  return "upload Xpat-owned CSV";
}

function statusForMarket(market: Market, performance: MappedMarketPerformance | undefined): ProofGateStatus {
  if (!performance) {
    return "insufficient-data";
  }

  if (!performance.hasFirstTransferEvidence) return "insufficient-data";
  if (performance.firstTransfers >= MIN_CONVERSIONS_FOR_TRUST) return "already-covered";
  return "confirmed-gap";
}

export function coverageForMarket(market: Market, importResult: AdsImportResult | null): MarketCoverage {
  if (!importResult) {
    return {
      costUsd: null,
      firstTransfers: 0,
      hasFirstTransferEvidence: false,
      impressions: null,
      label: coverageLabel("not-uploaded"),
      marketGeoid: market.geoid,
      rowCount: 0,
      status: "not-uploaded",
      trustedFloor: MIN_CONVERSIONS_FOR_TRUST,
    };
  }

  const performance = importResult.mappedMarkets.find((row) => row.marketGeoid === market.geoid);
  const status = statusForMarket(market, performance);

  return {
    costUsd: performance?.costUsd ?? null,
    firstTransfers: performance?.firstTransfers ?? 0,
    hasFirstTransferEvidence: performance?.hasFirstTransferEvidence ?? false,
    impressions: performance?.impressions ?? null,
    label: coverageLabel(status),
    marketGeoid: market.geoid,
    rowCount: performance?.rowCount ?? 0,
    status,
    trustedFloor: MIN_CONVERSIONS_FOR_TRUST,
  };
}
