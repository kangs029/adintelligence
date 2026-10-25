import { describe, expect, it } from "vitest";

import {
  buildFxPayload,
  fetchFrankfurterMidMarket,
  fetchWiseQuote,
  latestFxSnapshot,
  MANUAL_QUOTE_CAVEAT,
  manualQuoteFromOverlay,
  snapshotFxPayload,
} from "./fx";

const snapshotArtifact = {
  meta: {
    family: "fx-snapshots",
    version: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
    provenance: "snapshot",
    source: "test",
    method: "test",
    refreshCadence: "daily",
    caveats: [],
  },
  data: {
    corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
    snapshots: [
      {
        capturedAt: "2026-07-02T08:00:00.000Z",
        midMarket: {
          rate: 94.5,
          source: "Frankfurter",
          asOf: "2026-07-02",
        },
        providers: [
          {
            provider: "Remitly",
            quotedRate: 94.1,
            feeUSD: 0,
            receiveAmountFor1000USD: 94100,
            method: "page",
            sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
            capturedAt: "2026-07-02T08:00:00.000Z",
          },
        ],
      },
      {
        capturedAt: "2026-07-03T08:00:00.000Z",
        midMarket: {
          rate: 95,
          source: "Frankfurter",
          asOf: "2026-07-03",
        },
        providers: [
          {
            provider: "Remitly",
            quotedRate: 94.5,
            feeUSD: 0,
            receiveAmountFor1000USD: 94500,
            method: "page",
            sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
            capturedAt: "2026-07-03T08:00:00.000Z",
          },
          {
            provider: "Xoom",
            quotedRate: 94.8,
            feeUSD: 0,
            receiveAmountFor1000USD: 94800,
            method: "page",
            sourceUrl: "https://wise.com/us/compare/xoom-exchange-rate",
            capturedAt: "2026-07-03T08:00:00.000Z",
          },
          {
            provider: "Wise",
            quotedRate: 95,
            feeUSD: 10,
            receiveAmountFor1000USD: 94050,
            method: "api",
            sourceUrl: "https://api.wise.com/v3/quotes",
            capturedAt: "2026-07-03T08:00:00.000Z",
          },
        ],
      },
    ],
  },
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fx data", () => {
  it("selects the newest committed FX snapshot", () => {
    expect(latestFxSnapshot(snapshotArtifact).capturedAt).toBe("2026-07-03T08:00:00.000Z");
  });

  it("normalizes the latest committed snapshot into the runtime payload shape", () => {
    const payload = snapshotFxPayload(snapshotArtifact, "2026-07-03T00:00:00.000Z");

    expect(payload.provenance).toBe("snapshot");
    expect(payload.providers.map((provider) => provider.provider)).toEqual([
      "Xpat",
      "Remitly",
      "Wise",
      "Xoom",
      "Western Union",
      "Aspora",
      "Crobo",
    ]);
    expect(payload.providers.find((provider) => provider.provider === "Xpat")).toMatchObject({
      status: "connector-needed",
      quotedRate: null,
    });
    expect(payload.providers.find((provider) => provider.provider === "Remitly")).toMatchObject({
      status: "snapshot",
      effectiveMarginPctVsMid: 0.53,
    });
  });

  it("renders a complete manual Xpat quote overlay and ignores placeholders", () => {
    expect(
      manualQuoteFromOverlay("Xpat", {
        quotes: [
          {
            provider: "Xpat",
            quotedRate: null,
            feeUSD: null,
            receiveAmountFor1000USD: null,
            method: "manual",
            sourceUrl: "https://xpat.money/",
            capturedAt: null,
          },
        ],
      }),
    ).toBeUndefined();

    const payload = snapshotFxPayload(
      snapshotArtifact,
      "2026-07-03T00:00:00.000Z",
      undefined,
      {
        quotes: [
          {
            provider: "Xpat",
            quotedRate: 94.75,
            feeUSD: 2,
            receiveAmountFor1000USD: 94750,
            method: "manual",
            sourceUrl: "https://xpat.money/",
            capturedAt: "2026-07-03T09:00:00.000Z",
          },
        ],
      },
    );

    expect(payload.providers.find((provider) => provider.provider === "Xpat")).toMatchObject({
      status: "manual",
      method: "manual",
      caveat: MANUAL_QUOTE_CAVEAT,
      receiveAmountFor1000USD: 94750,
    });
  });

  it("normalizes the current Frankfurter v2 USD to INR response", async () => {
    const fetchImpl = async () =>
      jsonResponse([{ date: "2026-07-03", base: "USD", quote: "INR", rate: 95.3 }]);

    await expect(fetchFrankfurterMidMarket(fetchImpl)).resolves.toEqual({
      rate: 95.3,
      source: "Frankfurter v2",
      asOf: "2026-07-03",
    });
  });

  it("normalizes a Wise unauthenticated quote for a 1000 USD bank transfer", async () => {
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ sourceAmount: 1000 });
      return jsonResponse({
        sourceAmount: 1000,
        targetAmount: 94261.53,
        rate: 95.335,
        createdTime: "2026-07-03T08:12:14Z",
        paymentOptions: [
          {
            disabled: false,
            payIn: "BANK_TRANSFER",
            payOut: "BANK_TRANSFER",
            targetAmount: 94261.53,
            fee: { total: 11.26 },
          },
        ],
      });
    };

    await expect(fetchWiseQuote(fetchImpl)).resolves.toMatchObject({
      provider: "Wise",
      quotedRate: 95.335,
      feeUSD: 11.26,
      receiveAmountFor1000USD: 94261.53,
      sendAmountUSD: 1000,
      method: "api",
      sourceUrl: "https://api.wise.com/v3/quotes",
      capturedAt: "2026-07-03T08:12:14Z",
    });
  });

  it("requests Wise quotes for arbitrary send amounts", async () => {
    const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ sourceAmount: 200 });
      return jsonResponse({
        sourceAmount: 200,
        rate: 95.335,
        createdTime: "2026-07-03T08:12:14Z",
        paymentOptions: [
          {
            disabled: false,
            payIn: "BANK_TRANSFER",
            payOut: "BANK_TRANSFER",
            targetAmount: 18755.74,
            fee: { total: 11.26 },
          },
        ],
      });
    };

    await expect(fetchWiseQuote(fetchImpl, 200)).resolves.toMatchObject({
      provider: "Wise",
      feeUSD: 11.26,
      receiveAmountFor1000USD: 18755.74,
      sendAmountUSD: 200,
    });
  });

  it("uses live mid-market and keeps every provider row on the requested send amount", async () => {
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.includes("frankfurter")) {
        return jsonResponse([{ date: "2026-07-03", base: "USD", quote: "INR", rate: 95.3 }]);
      }
      if (href.includes("wise.com")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          sourceAmount: 5000,
        });
        return jsonResponse({
          sourceAmount: 5000,
          rate: 95.335,
          createdTime: "2026-07-03T08:12:14Z",
          paymentOptions: [
            {
              disabled: false,
              payIn: "BANK_TRANSFER",
              payOut: "BANK_TRANSFER",
              targetAmount: 465413.74,
              fee: { total: 11.26 },
            },
          ],
        });
      }
      throw new Error(`Unexpected URL ${href}`);
    };

    const payload = await buildFxPayload({
      fetchImpl,
      manualQuotes: {
        quotes: [
          {
            provider: "Xpat",
            quotedRate: 94.75,
            feeUSD: 2,
            receiveAmountFor1000USD: 94750,
            method: "manual",
            sourceUrl: "https://xpat.money/",
            capturedAt: "2026-07-03T09:00:00.000Z",
          },
        ],
      },
      snapshotArtifact,
      sendAmountUSD: 5000,
    });

    expect(payload.provenance).toBe("live");
    expect(payload.corridor.sendAmountUSD).toBe(5000);
    expect(payload.midMarket).toMatchObject({ rate: 95.3, asOf: "2026-07-03" });
    expect(payload.providers.find((provider) => provider.provider === "Wise")).toMatchObject({
      status: "live",
      quotedRate: 95.335,
      receiveAmountFor1000USD: 465413.74,
      sendAmountUSD: 5000,
    });
    expect(payload.providers.find((provider) => provider.provider === "Remitly")).toMatchObject({
      status: "snapshot",
      quotedRate: 94.5,
      receiveAmountFor1000USD: 472500,
      sendAmountUSD: 5000,
    });
    expect(payload.providers.find((provider) => provider.provider === "Xpat")).toMatchObject({
      status: "manual",
      quotedRate: 94.75,
      receiveAmountFor1000USD: 473560.5,
      sendAmountUSD: 5000,
    });
  });

  it("keeps snapshot fallback rows on the requested send amount when live FX fails", async () => {
    const fetchImpl = async () => new Response("unavailable", { status: 503 });

    const payload = await buildFxPayload({ fetchImpl, snapshotArtifact, sendAmountUSD: 200 });

    expect(payload.provenance).toBe("snapshot");
    expect(payload.corridor.sendAmountUSD).toBe(200);
    expect(payload.providers.find((provider) => provider.provider === "Remitly")).toMatchObject({
      status: "snapshot",
      quotedRate: 94.5,
      receiveAmountFor1000USD: 18900,
      sendAmountUSD: 200,
    });
    expect(payload.providers.find((provider) => provider.provider === "Xoom")).toMatchObject({
      status: "snapshot",
      quotedRate: 94.8,
      receiveAmountFor1000USD: 18960,
      sendAmountUSD: 200,
    });
    expect(payload.providers.find((provider) => provider.provider === "Aspora")).toMatchObject({
      status: "connector-needed",
      caveat: "No committed provider quote in the latest snapshot.",
    });
  });

  it("marks amount-adjusted Wise fallback as snapshot when only the Wise quote fails", async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("frankfurter")) {
        return jsonResponse([{ date: "2026-07-03", base: "USD", quote: "INR", rate: 95.3 }]);
      }

      return new Response("unavailable", { status: 503 });
    };

    const payload = await buildFxPayload({ fetchImpl, snapshotArtifact, sendAmountUSD: 200 });

    expect(payload.provenance).toBe("live");
    expect(payload.corridor.sendAmountUSD).toBe(200);
    expect(payload.providers.find((provider) => provider.provider === "Wise")).toMatchObject({
      status: "snapshot",
      method: "api",
      receiveAmountFor1000USD: 18050,
      sendAmountUSD: 200,
      effectiveMarginPctVsMid: 5.3,
    });
  });

  it("falls back visibly to the latest committed snapshot when live FX fails", async () => {
    const fetchImpl = async () => new Response("unavailable", { status: 503 });

    const payload = await buildFxPayload({ fetchImpl, snapshotArtifact });

    expect(payload.provenance).toBe("snapshot");
    expect(payload.fallbackReason).toContain("Frankfurter");
    expect(payload.midMarket).toEqual({
      rate: 95,
      source: "Frankfurter",
      asOf: "2026-07-03",
    });
    expect(payload.providers.find((provider) => provider.provider === "Remitly")).toMatchObject({
      status: "snapshot",
      quotedRate: 94.5,
    });
  });
});
