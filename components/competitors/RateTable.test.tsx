import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FxPayload, FxSnapshot } from "@/lib/data/fx";
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { MarginTrend } from "./MarginTrend";
import { RateTable } from "./RateTable";

const payload: FxPayload = {
  corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
  generatedAt: "2026-07-03T08:20:00.000Z",
  provenance: "live",
  midMarket: { rate: 95.3, source: "Frankfurter v2", asOf: "2026-07-03" },
  providers: [
    {
      provider: "Xpat",
      status: "connector-needed",
      quotedRate: null,
      feeUSD: null,
      receiveAmountFor1000USD: null,
      effectiveMarginPctVsMid: null,
      method: "connector-needed",
      sourceUrl: "https://xpat.money/",
      capturedAt: null,
      caveat:
        "Xpat public pages do not expose a stable machine-readable quote path. A quote endpoint would make this row live. A manually verified quote appears only when rate, fee, receive amount, and capture date are filled.",
    },
    {
      provider: "Remitly",
      status: "snapshot",
      quotedRate: 94.91,
      feeUSD: 0,
      receiveAmountFor1000USD: 94910,
      effectiveMarginPctVsMid: 0.41,
      method: "page",
      sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
      capturedAt: "2026-07-03T07:46:21.700407Z",
    },
    {
      provider: "Wise",
      status: "live",
      quotedRate: 95.33,
      feeUSD: 11.26,
      receiveAmountFor1000USD: 94260.34,
      effectiveMarginPctVsMid: 1.09,
      method: "api",
      sourceUrl: "https://api.wise.com/v3/quotes",
      capturedAt: "2026-07-03T08:12:14Z",
    },
    {
      provider: "Xoom",
      status: "snapshot",
      quotedRate: 95.25,
      feeUSD: 0,
      receiveAmountFor1000USD: 95250.34,
      effectiveMarginPctVsMid: 0.05,
      method: "page",
      sourceUrl: "https://wise.com/us/compare/xoom-exchange-rate",
      capturedAt: "2026-07-03T04:15:27.956047Z",
    },
    {
      provider: "Western Union",
      status: "connector-needed",
      quotedRate: null,
      feeUSD: null,
      receiveAmountFor1000USD: null,
      effectiveMarginPctVsMid: null,
      method: "connector-needed",
      sourceUrl: "https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html",
      capturedAt: null,
      caveat: "Western Union public pages did not expose a stable quote JSON path.",
    },
    {
      provider: "Aspora",
      status: "connector-needed",
      quotedRate: null,
      feeUSD: null,
      receiveAmountFor1000USD: null,
      effectiveMarginPctVsMid: null,
      method: "connector-needed",
      sourceUrl: "https://www.aspora.com/us",
      capturedAt: null,
      caveat: "No public machine-readable quote path found.",
    },
    {
      provider: "Crobo",
      status: "connector-needed",
      quotedRate: null,
      feeUSD: null,
      receiveAmountFor1000USD: null,
      effectiveMarginPctVsMid: null,
      method: "connector-needed",
      sourceUrl: "https://www.crobo.money/",
      capturedAt: null,
      caveat: "No public machine-readable quote path found.",
    },
  ],
};

const snapshots: FxSnapshot[] = [
  {
    capturedAt: "2026-07-01T00:00:00.000Z",
    midMarket: { rate: 95, source: "Frankfurter v2", asOf: "2026-07-01" },
    providers: [
      {
        provider: "Remitly",
        quotedRate: 94,
        feeUSD: 0,
        receiveAmountFor1000USD: 94000,
        method: "page",
        sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
        capturedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        provider: "Wise",
        quotedRate: 95,
        feeUSD: 6.85,
        receiveAmountFor1000USD: 94350,
        method: "api",
        sourceUrl: "https://api.wise.com/v3/quotes",
        capturedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  },
  {
    capturedAt: "2026-07-03T00:00:00.000Z",
    midMarket: { rate: 95.3, source: "Frankfurter v2", asOf: "2026-07-03" },
    providers: payload.providers,
  },
];

describe("competitor rate components", () => {
  it("renders live, snapshot, and connector-needed rate rows without claim violations", () => {
    const html = renderToStaticMarkup(<RateTable initialPayload={payload} />);

    expect(html).toContain("Rate check");
    expect(html).toContain("LIVE");
    expect(html).toContain("SNAPSHOT");
    expect(html).toContain("CONNECTOR NEEDED");
    expect(html).toContain("Xpat quote path needed");
    expect(html).toContain("A quote endpoint would make this row live");
    expect(html).toContain("receive amount, and capture date are filled");
    expect(html).toContain("Aspora");
    expect(html).toContain("Crobo");
    expect(html).toContain("No public machine-readable quote path found.");
    expect(html).toContain('href="/sources#source-fx-snapshots"');
    expect(html).toContain(">methodology<");
    expect(html).not.toContain('href="https://api.wise.com/v3/quotes"');
    expect(html).toContain("$200");
    expect(html).toContain("$5,000");
    expect(html).toContain("Likely promo or timing skew, verify.");
    expect(html).toContain("Latest provider quote captured");
    expect(html).toContain("ECB business-day availability");
    expect(html).toContain("provider-cell-inner");
    expect(html).toContain("Provider rows are public $1,000 bank-transfer quotes");
    expect(html).toContain("Margin vs mid is the gap");
    expect(html).toContain("Lower margin means the quote is closer to mid-market");
    expect(findCopyViolations(html, "components/competitors/RateTable.tsx")).toEqual([]);
  });

  it("renders manual Xpat quote rows with the hand-capture caveat", () => {
    const html = renderToStaticMarkup(
      <RateTable
        initialPayload={{
          ...payload,
          providers: payload.providers.map((provider) =>
            provider.provider === "Xpat"
              ? {
                  ...provider,
                  status: "manual",
                  quotedRate: 94.75,
                  feeUSD: 2,
                  receiveAmountFor1000USD: 94750,
                  effectiveMarginPctVsMid: 0.58,
                  method: "manual",
                  capturedAt: "2026-07-03T09:00:00.000Z",
                  caveat:
                    "hand-captured from public pages; no quote endpoint exists for automation.",
                }
              : provider,
          ),
        }}
      />,
    );

    expect(html).toContain("MANUAL");
    expect(html).toContain("manual");
    expect(html).toContain("hand-captured from public pages");
    expect(html).not.toContain("Xpat quote path needed");
    expect(findCopyViolations(html, "components/competitors/RateTable.tsx")).toEqual([]);
  });

  it("renders a collecting state until seven snapshot days exist", () => {
    const html = renderToStaticMarkup(<MarginTrend snapshots={snapshots} />);

    expect(html).toContain("Daily margin snapshots");
    expect(html).toContain("2 days tracked, trend line unlocks at 7");
    expect(html).toContain("Daily snapshots started Jul 1. Dots are shown now");
    expect(html).toContain("keeps up to 90 days");
    expect(html).toContain("circle");
    expect(html).toContain("Remitly");
    expect(html).toContain("Wise");
    expect(html).not.toContain("Western Union");
    expect(html).not.toContain(["C", "A", "C"].join(""));
    expect(html).not.toContain(["R", "O", "I"].join(""));
  });
});
