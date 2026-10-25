import { describe, expect, it } from "vitest";

import { validateClaims } from "@/lib/claims/contract";
import type { FxPayload } from "./fx";
import {
  POSITIONING_LANE_COPY,
  buildAppPresenceSummaries,
  buildReviewGapInsights,
  buildTodayPosition,
} from "./competitor-insights";

const fxPayload: FxPayload = {
  corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
  generatedAt: "2026-07-05T08:00:00.000Z",
  provenance: "snapshot",
  midMarket: { rate: 100, source: "Frankfurter v2", asOf: "2026-07-05" },
  providers: [
    {
      capturedAt: null,
      caveat: "Xpat publishes rates on xpat.money but not in machine-readable form.",
      effectiveMarginPctVsMid: null,
      feeUSD: null,
      method: "connector-needed",
      provider: "Xpat",
      quotedRate: null,
      receiveAmountFor1000USD: null,
      sourceUrl: "https://xpat.money/",
      status: "connector-needed",
    },
    {
      capturedAt: "2026-07-05T08:00:00.000Z",
      effectiveMarginPctVsMid: 1,
      feeUSD: 0,
      method: "page",
      provider: "Remitly",
      quotedRate: 99,
      receiveAmountFor1000USD: 99000,
      sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
      status: "snapshot",
    },
    {
      capturedAt: "2026-07-05T08:00:00.000Z",
      effectiveMarginPctVsMid: 2,
      feeUSD: 10,
      method: "api",
      provider: "Wise",
      quotedRate: 100,
      receiveAmountFor1000USD: 98000,
      sourceUrl: "https://api.wise.com/v3/quotes",
      status: "live",
    },
    {
      capturedAt: "2026-07-05T08:00:00.000Z",
      effectiveMarginPctVsMid: 0.5,
      feeUSD: 0,
      method: "page",
      provider: "Xoom",
      quotedRate: 99.5,
      receiveAmountFor1000USD: 99500,
      sourceUrl: "https://wise.com/us/compare/xoom-exchange-rate",
      status: "snapshot",
    },
    {
      capturedAt: null,
      caveat: "Western Union public pages did not expose a stable quote JSON path.",
      effectiveMarginPctVsMid: null,
      feeUSD: null,
      method: "connector-needed",
      provider: "Western Union",
      quotedRate: null,
      receiveAmountFor1000USD: null,
      sourceUrl: "https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html",
      status: "connector-needed",
    },
  ],
};

const reviewArtifact = {
  data: {
    groups: [
      {
        averageRating: 4.6,
        competitor: "Remitly",
        sampleSize: 200,
        store: "android",
        themes: [
          { count: 20, examples: [], sharePct: 10, theme: "App bugs" },
          { count: 10, examples: [], sharePct: 5, theme: "Fees" },
          { count: 30, examples: [], sharePct: 15, theme: "Speed" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
      {
        averageRating: 4.2,
        competitor: "Western Union",
        sampleSize: 200,
        store: "android",
        themes: [
          { count: 60, examples: [], sharePct: 30, theme: "App bugs" },
          { count: 30, examples: [], sharePct: 15, theme: "Fees" },
          { count: 10, examples: [], sharePct: 5, theme: "Speed" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
      {
        averageRating: 4.7,
        competitor: "Wise",
        sampleSize: 200,
        store: "android",
        themes: [
          { count: 15, examples: [], sharePct: 7.5, theme: "App bugs" },
          { count: 20, examples: [], sharePct: 10, theme: "Fees" },
          { count: 40, examples: [], sharePct: 20, theme: "Speed" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
      {
        averageRating: 4.1,
        competitor: "Xoom",
        sampleSize: 200,
        store: "android",
        themes: [
          { count: 50, examples: [], sharePct: 25, theme: "App bugs" },
          { count: 5, examples: [], sharePct: 2.5, theme: "Fees" },
          { count: 10, examples: [], sharePct: 5, theme: "Speed" },
        ],
        window: { from: "2026-06-01", to: "2026-07-01" },
      },
      {
        averageRating: 3.8,
        competitor: "Xpat",
        sampleSize: 44,
        store: "android",
        themes: [
          { count: 19, examples: [], sharePct: 43.2, theme: "App bugs" },
          { count: 11, examples: [], sharePct: 25, theme: "Support" },
        ],
        window: { from: "2024-11-21", to: "2026-06-24" },
      },
    ],
  },
  meta: { generatedAt: "2026-07-05T00:00:00.000Z" },
};

describe("competitor insight helpers", () => {
  it("builds today's price verdict from the latest FX payload", () => {
    const summary = buildTodayPosition({
      fxPayload,
      positioningLine: POSITIONING_LANE_COPY,
      reviewArtifact,
    });

    expect(summary[0]).toMatchObject({
      anchor: "#rate-table-title",
      chip: "DERIVED",
      label: "Price",
      text:
        "Xoom is closest to mid-market today at 0.50%. Best to worst quote is a ₹1,500 difference on $1,000. Xpat quote pending, see rate check.",
    });
    expect(validateClaims(summary, "copy")).toEqual([]);
  });

  it("includes Xpat rank when a manual Xpat quote exists", () => {
    const summary = buildTodayPosition({
      fxPayload: {
        ...fxPayload,
        providers: fxPayload.providers.map((provider) =>
          provider.provider === "Xpat"
            ? {
                ...provider,
                capturedAt: "2026-07-05T09:00:00.000Z",
                effectiveMarginPctVsMid: 1.5,
                feeUSD: 2,
                method: "manual",
                quotedRate: 98.7,
                receiveAmountFor1000USD: 98500,
                status: "manual",
              }
            : provider,
        ),
      },
      positioningLine: POSITIONING_LANE_COPY,
      reviewArtifact,
    });

    expect(summary[0].text).toContain("Xpat ranks 3 of 4 quoted providers.");
  });

  it("selects the largest cross-provider review gaps and keeps Xpat separate", () => {
    const insights = buildReviewGapInsights(reviewArtifact);

    expect(insights.gaps[0]).toMatchObject({
      strongestProvider: "Wise",
      strongestSharePct: 7.5,
      theme: "App bugs",
      weakestProvider: "Western Union",
      weakestSharePct: 30,
    });
    expect(insights.gaps[0].sentence).toBe(
      "Western Union reviews mention app bugs at 30% (n=200), versus 8% (n=200) for Wise. Treat this as a topic delta to inspect, not a sentiment score.",
    );
    expect(insights.xpatSignal).toMatchObject({
      caveat: "small sample",
      sampleSize: 44,
      theme: "App bugs",
    });
    expect(insights.xpatSignal?.sentence).toBe(
      "Xpat's own topic signal: mentions of app bugs appear in 43% (n=44) of its lifetime reviews. Small sample, not a sentiment score.",
    );
    expect(validateClaims(insights, "copy")).toEqual([]);
  });

  it("builds app presence summaries with explicit window and lifetime labels", () => {
    const summaries = buildAppPresenceSummaries(reviewArtifact);

    expect(summaries).toContainEqual(
      expect.objectContaining({
        averageRating: 4.6,
        countLabel: "window",
        provider: "Remitly",
        reviewCount: 200,
      }),
    );
    expect(summaries).toContainEqual(
      expect.objectContaining({
        averageRating: 3.8,
        countLabel: "lifetime",
        provider: "Xpat",
        reviewCount: 44,
      }),
    );
    expect(summaries.find((summary) => summary.provider === "Remitly")?.reviewsPerMonth).toBe(203);
  });
});
