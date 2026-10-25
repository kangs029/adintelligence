"use client";

import { useMemo, useState } from "react";

import type { Market } from "@/lib/data/markets";
import {
  parseAdsCsv,
  type AdsImportResult,
  type MappedMarketPerformance,
} from "@/lib/playbook/ads-import";
import { coverageForMarket } from "@/lib/playbook/coverage";

interface MeasurementProofGateProps {
  market: Market;
  markets: Market[];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatNullableNumber(value: number | null) {
  return value === null ? "Not provided" : formatNumber(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatNullableCurrency(value: number | null) {
  return value === null ? "Not provided" : formatCurrency(value);
}

type SamplePerformanceForStatus = Pick<MappedMarketPerformance, "firstTransfers" | "hasFirstTransferEvidence">;

function sampleStatusFor(performance: SamplePerformanceForStatus, trustedFloor: number) {
  if (!performance.hasFirstTransferEvidence) return "insufficient-data";
  return performance.firstTransfers >= trustedFloor ? "already-covered" : "confirmed-gap";
}

export function sampleDemoStatusCopy(performance: SamplePerformanceForStatus, trustedFloor: number) {
  if (!performance.hasFirstTransferEvidence) {
    return `first_transfers evidence is missing, so the sample remains insufficient for the ${trustedFloor}-transfer trust floor.`;
  }

  const transfers = formatNumber(performance.firstTransfers);
  if (performance.firstTransfers >= trustedFloor) {
    return `${transfers} demo first_transfers crosses the ${trustedFloor}-transfer trust floor.`;
  }

  return `${transfers} demo first_transfers is below the ${trustedFloor}-transfer trust floor.`;
}

function labelForStatus(status: string) {
  if (status === "already-covered") return "already covered";
  if (status === "confirmed-gap") return "confirmed gap";
  if (status === "insufficient-data") return "insufficient data";
  return "upload Xpat-owned CSV";
}

export function MeasurementProofGate({ market, markets }: MeasurementProofGateProps) {
  const [result, setResult] = useState<AdsImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coverage = useMemo(() => coverageForMarket(market, result), [market, result]);
  const samplePerformance = useMemo(
    () => result?.sampleMappedMarkets.find((row) => row.marketGeoid === market.geoid) ?? null,
    [market.geoid, result],
  );
  const transferEvidenceText = coverage.hasFirstTransferEvidence
    ? `${coverage.firstTransfers} owned first transfers in this market; floor is ${coverage.trustedFloor}.`
    : `First-transfer evidence not provided yet; upload Xpat-owned first_transfers to evaluate the ${coverage.trustedFloor}-transfer floor.`;
  const isSampleDemo = Boolean(samplePerformance && result?.sampleRows.length && coverage.rowCount === 0);
  const displayedStatus = isSampleDemo && samplePerformance
    ? sampleStatusFor(samplePerformance, coverage.trustedFloor)
    : coverage.status;
  const displayedLabel = isSampleDemo
    ? `sample demo: ${labelForStatus(displayedStatus)}`
    : coverage.label;
  const displayedRows = isSampleDemo && samplePerformance ? samplePerformance.rowCount : coverage.rowCount;
  const displayedCost = isSampleDemo && samplePerformance ? samplePerformance.costUsd : coverage.costUsd;
  const displayedImpressions = isSampleDemo && samplePerformance ? samplePerformance.impressions : coverage.impressions;
  const displayedFirstTransfers = isSampleDemo && samplePerformance
    ? samplePerformance.firstTransfers
    : coverage.firstTransfers;
  const statusText = isSampleDemo && samplePerformance
    ? `Using ${fileName}. SAMPLE DATA ONLY: ${sampleDemoStatusCopy(samplePerformance, coverage.trustedFloor)} This demonstrates the gate behavior and is not Xpat-owned evidence.`
    : `${fileName ? `Using ${fileName}. ` : "Waiting for an Xpat-owned export. "}${transferEvidenceText}`;

  return (
    <div className="proof-gate" id="measurement-proof-gate">
      <div className="proof-upload">
        <div>
          <h3>Measurement proof gate</h3>
          <p>
            Upload one Xpat-owned CSV. Parsing happens in this browser session only; nothing is persisted server-side.
          </p>
          <p className="sample-warning">
            Sample data for demo only. Rows marked sample_data can demonstrate the trust-floor flip, but they are not Xpat-owned evidence.
          </p>
        </div>
        <div className="proof-actions">
          <a className="btn btn-secondary" href="/samples/xpat-proof-gate-sample-data.csv" download>
            Download sample data CSV
          </a>
          <label className="btn">
            Upload CSV
            <input
              accept=".csv,text/csv"
              aria-label="Upload Xpat-owned geo performance CSV"
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  setResult(parseAdsCsv(text, markets));
                  setFileName(file.name);
                  setError(null);
                } catch (uploadError) {
                  setResult(null);
                  setFileName(file.name);
                  setError(uploadError instanceof Error ? uploadError.message : "CSV could not be parsed.");
                }
              }}
            />
          </label>
        </div>
      </div>

      <div className={`proof-status proof-status-${displayedStatus}${isSampleDemo ? " proof-status-sample-demo" : ""}`}>
        <span>Proof status</span>
        <strong>{displayedLabel}</strong>
        <p>{statusText}</p>
      </div>

      {samplePerformance ? (
        <div className="proof-sample-preview">
          <span>Sample mapping preview</span>
          <strong>{market.name} row recognized</strong>
          <p>
            The sample row includes {formatNumber(samplePerformance.firstTransfers)} demo first_transfers and{" "}
            {formatNullableNumber(samplePerformance.impressions)} demo impressions. It is separate from Xpat-owned
            exports and is used only for the demo trust-floor state.
          </p>
        </div>
      ) : null}

      <div className="proof-metrics">
        <div>
          <span>{isSampleDemo ? "Sample market rows" : "Selected-market rows"}</span>
          <strong>{formatNumber(displayedRows)}</strong>
        </div>
        <div>
          <span>{isSampleDemo ? "Sample cost" : "Uploaded cost"}</span>
          <strong>{formatNullableCurrency(displayedCost)}</strong>
        </div>
        <div>
          <span>{isSampleDemo ? "Sample impressions" : "Impressions"}</span>
          <strong>{formatNullableNumber(displayedImpressions)}</strong>
        </div>
        <div>
          <span>{isSampleDemo ? "Sample first_transfers" : "First transfers"}</span>
          <strong>{formatNumber(displayedFirstTransfers)}</strong>
        </div>
        <div>
          <span>Unmapped rows</span>
          <strong>{formatNumber(result?.unmappedRows.length ?? 0)}</strong>
        </div>
        <div>
          <span>Sample rows loaded</span>
          <strong>{formatNumber(result?.sampleRows.length ?? 0)}</strong>
        </div>
      </div>

      {error ? <p className="proof-error">{error}</p> : null}
      {result?.schema.missingRecommendedHeaders.length ? (
        <p className="method-note">
          Missing recommended CSV fields: {result.schema.missingRecommendedHeaders.join(", ")}.
        </p>
      ) : null}
      {result?.unmappedRows.length ? (
        <details className="proof-details">
          <summary>Show unmapped rows excluded from aggregates</summary>
          <ul>
            {result.unmappedRows.slice(0, 5).map((row) => (
              <li key={`${row.rowNumber}-${row.reason}`}>
                Row {row.rowNumber}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {result?.sampleUnmappedRows.length ? (
        <details className="proof-details">
          <summary>Show sample rows kept out of Xpat-owned aggregates</summary>
          <ul>
            {result.sampleUnmappedRows.slice(0, 5).map((row) => (
              <li key={`${row.rowNumber}-${row.reason}`}>
                Row {row.rowNumber}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
