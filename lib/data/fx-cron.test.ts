import { describe, expect, it } from "vitest";

import { buildDailyFxSnapshot, snapshotFromFxPayload } from "./fx-cron";
import type { FxPayload } from "./fx";

const snapshotArtifact = {
  data: {
    corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
    snapshots: [
      {
        capturedAt: "2026-07-04T00:00:00.000Z",
        midMarket: { rate: 95, source: "Frankfurter", asOf: "2026-07-04" },
        providers: [
          {
            provider: "Remitly",
            quotedRate: 94.7,
            feeUSD: 0,
            receiveAmountFor1000USD: 94700,
            method: "page",
            sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
            capturedAt: "2026-07-04T00:00:00.000Z",
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

function liveFxFetch(calls: string[]) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const href = String(input);
    calls.push(`${init?.method ?? "GET"} ${href}`);

    if (href.includes("frankfurter")) {
      return jsonResponse([{ date: "2026-07-05", base: "USD", quote: "INR", rate: 95.4 }]);
    }

    if (href.includes("wise.com")) {
      return jsonResponse({
        createdTime: "2026-07-05T08:00:00Z",
        rate: 95.42,
        sourceAmount: 1000,
        paymentOptions: [
          {
            disabled: false,
            fee: { total: 11.26 },
            payIn: "BANK_TRANSFER",
            payOut: "BANK_TRANSFER",
            targetAmount: 94310,
          },
        ],
      });
    }

    if (href === "https://example.com/fx-sink") {
      expect(init?.method).toBe("POST");
      expect(init?.body).toContain("fx-snapshots");
      return jsonResponse({ ok: true });
    }

    throw new Error(`Unexpected fetch ${href}`);
  };
}

describe("FX cron snapshot", () => {
  it("strips runtime-only quote fields before persistence", () => {
    const payload: FxPayload = {
      corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
      generatedAt: "2026-07-05T08:00:00.000Z",
      midMarket: { rate: 95.4, source: "Frankfurter v2", asOf: "2026-07-05" },
      provenance: "live",
      providers: [
        {
          capturedAt: "2026-07-05T08:00:00.000Z",
          effectiveMarginPctVsMid: 1.12,
          feeUSD: 11.26,
          method: "api",
          provider: "Wise",
          quotedRate: 95.42,
          receiveAmountFor1000USD: 94310,
          sourceUrl: "https://api.wise.com/v3/quotes",
          status: "live",
        },
      ],
    };

    expect(snapshotFromFxPayload(payload)).toEqual({
      capturedAt: "2026-07-05T08:00:00.000Z",
      midMarket: payload.midMarket,
      providers: [
        {
          capturedAt: "2026-07-05T08:00:00.000Z",
          feeUSD: 11.26,
          method: "api",
          provider: "Wise",
          quotedRate: 95.42,
          receiveAmountFor1000USD: 94310,
          sourceUrl: "https://api.wise.com/v3/quotes",
        },
      ],
    });
  });

  it("captures an FX snapshot and marks persistence connector-needed without a webhook", async () => {
    const calls: string[] = [];

    const result = await buildDailyFxSnapshot({
      capturedAt: "2026-07-05T09:00:00.000Z",
      fetchImpl: liveFxFetch(calls),
      snapshotArtifact,
    });

    expect(result.persistence.status).toBe("connector-needed");
    expect(result.snapshot.capturedAt).toBe("2026-07-05T09:00:00.000Z");
    expect(result.snapshot.providers.find((provider) => provider.provider === "Wise")).toMatchObject({
      method: "api",
      quotedRate: 95.42,
    });
    expect(calls.some((call) => call.includes("example.com/fx-sink"))).toBe(false);
  });

  it("forwards the captured snapshot when a durable webhook is configured", async () => {
    const calls: string[] = [];

    const result = await buildDailyFxSnapshot({
      capturedAt: "2026-07-05T09:00:00.000Z",
      fetchImpl: liveFxFetch(calls),
      snapshotArtifact,
      webhookUrl: "https://example.com/fx-sink",
    });

    expect(result.persistence).toEqual({
      status: "persisted",
      target: "https://example.com/fx-sink",
    });
    expect(calls).toContain("POST https://example.com/fx-sink");
  });
});
