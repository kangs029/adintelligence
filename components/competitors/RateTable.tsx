"use client";

import { useEffect, useMemo, useState } from "react";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import { SourceLink } from "@/components/shell/SourceLink";
import { bestEligibleQuote, quoteForSendAmount, quoteQuality } from "@/lib/data/fx-display";
import type { FxPayload, FxProviderQuote } from "@/lib/data/fx";
import { providerColors } from "./provider-colors";

interface RateTableProps {
  initialPayload: FxPayload;
}

function formatRate(value: number | null) {
  if (value === null) return "Quote path needed";
  return value.toFixed(4);
}

function formatCurrency(value: number | null, currency: "USD" | "INR") {
  if (value === null) return "Quote path needed";

  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
    style: "currency",
  }).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatMargin(value: number | null) {
  if (value === null) return "Quote path needed";
  return `${value.toFixed(2)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "Needs source";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatUtcTimestamp(value: string | null) {
  if (!value) return "Needs source";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function formatSnapshotDate(payload: FxPayload) {
  const latest = payload.providers
    .map((provider) => provider.capturedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return latest ? formatDateTime(latest) : payload.midMarket.asOf;
}

function latestProviderCapture(payload: FxPayload) {
  return (
    payload.providers
      .map((provider) => provider.capturedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function providerLabel(provider: FxProviderQuote) {
  if (provider.provider === "Xpat" && provider.status === "connector-needed") {
    return "Xpat quote path needed";
  }

  return formatRate(provider.quotedRate);
}

function sourceHref(provider: FxProviderQuote) {
  if (provider.provider === "Wise") {
    return "/sources#source-fx-snapshots";
  }

  return provider.sourceUrl;
}

function sourceLabel(provider: FxProviderQuote) {
  if (provider.provider === "Wise") {
    return "methodology";
  }

  return provider.method;
}

function statusChip(provider: FxProviderQuote) {
  if (provider.status === "live") {
    return <ProvenanceChip provenance="live" />;
  }

  if (provider.status === "manual") {
    return (
      <span className="provenance-chip chip-manual">
        MANUAL · {formatDateTime(provider.capturedAt)}
      </span>
    );
  }

  if (provider.status === "snapshot") {
    return <ProvenanceChip date={formatDateTime(provider.capturedAt)} provenance="snapshot" />;
  }

  return <ProvenanceChip provenance="connector-needed" />;
}

function quoteCaveat(provider: FxProviderQuote) {
  if (provider.provider === "Xpat" && provider.status === "connector-needed") {
    return "Xpat public pages do not expose a stable machine-readable quote path. A quote endpoint would make this row live. A manually verified quote appears only when rate, fee, receive amount, and capture date are filled.";
  }

  if (provider.caveat) return provider.caveat;
  return "Quote endpoint needed before this provider can be monitored.";
}

type DisplayQuote = ReturnType<typeof quoteForSendAmount>;

function marginCell(provider: FxProviderQuote, displayQuote: DisplayQuote) {
  const quality =
    displayQuote.effectiveMarginPctVsMid === null
      ? quoteQuality(provider)
      : {
          eligibleForBest: displayQuote.effectiveMarginPctVsMid >= promoTimingSkewEpsilonPct,
          flagged: displayQuote.effectiveMarginPctVsMid < promoTimingSkewEpsilonPct,
          reason:
            displayQuote.effectiveMarginPctVsMid < promoTimingSkewEpsilonPct
              ? "Likely promo or timing skew, verify."
              : null,
        };

  return (
    <span className="rate-quality-stack">
      {formatMargin(displayQuote.effectiveMarginPctVsMid)}
      {quality.flagged ? <span className="rate-warning-badge">{quality.reason}</span> : null}
    </span>
  );
}

const amountOptions = [200, 1000, 5000] as const;
const promoTimingSkewEpsilonPct = 0.1;

function bestDisplayProvider(payload: FxPayload, sendAmountUSD: number) {
  const rows = payload.providers
    .map((provider) => ({
      provider,
      quote: quoteForSendAmount({
        midMarketRate: payload.midMarket.rate,
        provider,
        sendAmountUSD,
      }),
    }))
    .filter(
      (row): row is typeof row & { quote: DisplayQuote & { receiveAmount: number } } =>
        row.quote.receiveAmount !== null,
    );

  const clean = rows.filter(
    (row) =>
      row.quote.effectiveMarginPctVsMid !== null &&
      row.quote.effectiveMarginPctVsMid >= promoTimingSkewEpsilonPct,
  );

  const candidates = clean.length > 0 ? clean : rows.filter((row) => row.provider.status === "live");
  return [...candidates].sort((left, right) => right.quote.receiveAmount - left.quote.receiveAmount)[0]
    ?.provider;
}

export function RateTable({ initialPayload }: RateTableProps) {
  const [payload, setPayload] = useState(initialPayload);
  const [liveFailed, setLiveFailed] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const isLive = payload.provenance === "live";
  const defaultBestProvider = useMemo(() => bestEligibleQuote(payload.providers), [payload.providers]);
  const bestProvider = useMemo(
    () => bestDisplayProvider(payload, selectedAmount) ?? defaultBestProvider,
    [defaultBestProvider, payload, selectedAmount],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    fetch(`/api/fx?amount=${selectedAmount}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`FX route returned ${response.status}`);
        return response.json() as Promise<FxPayload>;
      })
      .then((nextPayload) => {
        setPayload(nextPayload);
        setLiveFailed(nextPayload.provenance !== "live");
      })
      .catch(() => {
        setLiveFailed(true);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedAmount]);

  return (
    <section className="evidence-section" aria-labelledby="rate-table-title">
      <div className="cardhead">
        <div>
          <h2 id="rate-table-title">Rate check · send {formatUsd(selectedAmount)} to India</h2>
          <p className="section-subtitle">
            Latest provider quote captured {formatUtcTimestamp(latestProviderCapture(payload))}.
            Mid-market reference: {payload.midMarket.source}, {payload.midMarket.asOf}; ECB
            business-day availability.
          </p>
        </div>
        <ProvenanceChip
          date={isLive ? undefined : formatSnapshotDate(payload)}
          provenance={isLive ? "live" : "snapshot"}
        />
      </div>
      {liveFailed || payload.provenance === "snapshot" ? (
        <p className="evidence-banner">
          Live quotes unavailable, showing snapshot from {formatSnapshotDate(payload)}.
        </p>
      ) : null}
      <div className="rate-table-card">
        <div className="amount-toggle" aria-label="Send amount">
          {amountOptions.map((amount) => (
            <button
              aria-pressed={selectedAmount === amount}
              className="filter-pill"
              key={amount}
              onClick={() => setSelectedAmount(amount)}
              type="button"
            >
              {formatUsd(amount)}
            </button>
          ))}
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th className="numeric">Quoted rate</th>
                <th className="numeric">Fee</th>
                <th className="numeric">Recipient gets</th>
                <th className="numeric">Effective margin vs mid</th>
                <th>Source</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {payload.providers.map((provider) => {
                const isBest = provider.provider === bestProvider?.provider;
                const displayQuote = quoteForSendAmount({
                  midMarketRate: payload.midMarket.rate,
                  provider,
                  sendAmountUSD: selectedAmount,
                });

                return (
                  <tr key={provider.provider}>
                    <td className="provider-cell">
                      <span className="provider-cell-inner">
                        <span
                          className="provider-dot"
                          style={{ background: providerColors[provider.provider] }}
                          aria-hidden="true"
                        />
                        {provider.provider}
                      </span>
                    </td>
                    {provider.status === "connector-needed" ? (
                      <td className="quote-caveat-cell" colSpan={4}>
                        <strong>{providerLabel(provider)}</strong>
                        <span>{quoteCaveat(provider)}</span>
                      </td>
                    ) : (
                      <>
                        <td className={`numeric${isBest ? " best-value" : ""}`}>
                          {providerLabel(provider)}
                        </td>
                        <td className="numeric">{formatCurrency(provider.feeUSD, "USD")}</td>
                        <td className={`numeric${isBest ? " best-value" : ""}`}>
                          {formatCurrency(displayQuote.receiveAmount, "INR")}
                        </td>
                        <td className="numeric">{marginCell(provider, displayQuote)}</td>
                      </>
                    )}
                    <td>
                      <SourceLink href={sourceHref(provider)}>{sourceLabel(provider)}</SourceLink>
                      {displayQuote.derived ? (
                        <span className="rate-source-caveat">
                          Recomputed from the $1,000 public quote, provider tier pricing may differ.
                        </span>
                      ) : null}
                      {provider.status !== "connector-needed" && provider.caveat ? (
                        <span className="rate-source-caveat">{provider.caveat}</span>
                      ) : null}
                    </td>
                    <td className="rate-asof">{statusChip(provider)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="boundary-line">
          Margin vs mid is the gap between the provider effective receive rate and the
          Frankfurter mid-market USD to INR rate. Effective receive rate is recipient gets
          divided by the selected send amount. Lower margin means the quote is closer to
          mid-market. Provider rows are public $1,000 bank-transfer quotes unless marked
          recomputed. Frankfurter follows ECB business-day availability, so a later provider
          quote can appear beside the latest ECB reference date. Public quote evidence does
          not prove targeting, delivery, or performance.
        </p>
      </div>
    </section>
  );
}
