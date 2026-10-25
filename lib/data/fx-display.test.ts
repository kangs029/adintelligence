import { describe, expect, it } from "vitest";

import type { FxProviderQuote } from "./fx";
import { bestEligibleQuote, quoteForSendAmount, quoteQuality } from "./fx-display";

function provider(overrides: Partial<FxProviderQuote>): FxProviderQuote {
  return {
    capturedAt: "2026-07-03T00:00:00.000Z",
    effectiveMarginPctVsMid: 0.4,
    feeUSD: 0,
    method: "page",
    provider: "Remitly",
    quotedRate: 94.9,
    receiveAmountFor1000USD: 94900,
    sourceUrl: "https://example.com",
    status: "snapshot",
    ...overrides,
  } as FxProviderQuote;
}

describe("FX display quality rules", () => {
  it("flags rows with negative or near-zero margin as likely promo or timing skew", () => {
    expect(quoteQuality(provider({ effectiveMarginPctVsMid: -0.02 }))).toMatchObject({
      eligibleForBest: false,
      flagged: true,
      reason: "Likely promo or timing skew, verify.",
    });
    expect(quoteQuality(provider({ effectiveMarginPctVsMid: 0.05 }))).toMatchObject({
      eligibleForBest: false,
      flagged: true,
    });
  });

  it("excludes flagged rows from best quote highlighting", () => {
    const best = bestEligibleQuote([
      provider({
        effectiveMarginPctVsMid: 0.05,
        provider: "Xoom",
        receiveAmountFor1000USD: 95250,
      }),
      provider({
        effectiveMarginPctVsMid: 0.41,
        provider: "Remitly",
        receiveAmountFor1000USD: 94906,
      }),
      provider({
        effectiveMarginPctVsMid: 1.09,
        provider: "Wise",
        receiveAmountFor1000USD: 94260,
        status: "live",
      }),
    ]);

    expect(best?.provider).toBe("Remitly");
  });

  it("falls back to the best live row when every public quote is flagged", () => {
    const best = bestEligibleQuote([
      provider({
        effectiveMarginPctVsMid: 0.05,
        provider: "Xoom",
        receiveAmountFor1000USD: 95250,
      }),
      provider({
        effectiveMarginPctVsMid: 0.04,
        provider: "Wise",
        receiveAmountFor1000USD: 95200,
        status: "live",
      }),
    ]);

    expect(best?.provider).toBe("Wise");
  });

  it("recomputes fixed public-page quotes when the send amount changes", () => {
    expect(
      quoteForSendAmount({
        midMarketRate: 95.3,
        provider: provider({
          feeUSD: 0,
          method: "page",
          quotedRate: 94.9,
          receiveAmountFor1000USD: 94900,
        }),
        sendAmountUSD: 200,
      }),
    ).toMatchObject({
      derived: true,
      effectiveMarginPctVsMid: 0.42,
      receiveAmount: 18980,
    });
  });

  it("keeps live Wise quotes as live rows for the requested amount", () => {
    expect(
      quoteForSendAmount({
        midMarketRate: 95.3,
        provider: provider({
          feeUSD: 11.26,
          method: "api",
          provider: "Wise",
          quotedRate: 95.33,
          receiveAmountFor1000USD: 18755.74,
          sendAmountUSD: 200,
          status: "live",
        }),
        sendAmountUSD: 200,
      }),
    ).toMatchObject({
      derived: false,
      effectiveMarginPctVsMid: 1.6,
      receiveAmount: 18755.74,
      });
  });

  it("does not reuse a stale live Wise receive amount for a different send amount", () => {
    expect(
      quoteForSendAmount({
        midMarketRate: 95.3,
        provider: provider({
          feeUSD: 10,
          method: "api",
          provider: "Wise",
          quotedRate: 95,
          receiveAmountFor1000USD: 94000,
          status: "live",
        }),
        sendAmountUSD: 200,
      }),
    ).toMatchObject({
      derived: true,
      effectiveMarginPctVsMid: 5.3,
      receiveAmount: 18050,
    });
  });

  it("still labels server-adjusted snapshot rows as derived when the amount is not the default", () => {
    expect(
      quoteForSendAmount({
        midMarketRate: 95.3,
        provider: provider({
          feeUSD: 0,
          method: "page",
          quotedRate: 94.9,
          receiveAmountFor1000USD: 18980,
          sendAmountUSD: 200,
          status: "snapshot",
        }),
        sendAmountUSD: 200,
      }),
    ).toMatchObject({
      derived: true,
      effectiveMarginPctVsMid: 0.42,
      receiveAmount: 18980,
    });
  });
});
