import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildFxSnapshotArtifact,
  MANUAL_QUOTE_CAVEAT,
  manualQuoteFromOverlay,
  parseWiseComparisonQuote,
  providerConnectorNeeded,
  runRates,
} from "./rates.mjs";

const nextData = {
  props: {
    pageProps: {
      quotes: [
        {
          alias: "wise",
          name: "Wise",
          dateCollected: "2026-07-03T08:12:14Z",
          fees: 6.85,
          rate: 95.335,
          receivedAmount: 94681.96,
        },
        {
          alias: "remitly",
          name: "Remitly",
          dateCollected: "2026-07-03T07:46:21.700407Z",
          fees: 0,
          rate: 94.9135120672,
          receivedAmount: 94913.51,
        },
      ],
      providerRouteData: {
        alias: "xoom",
        routes: [
          {
            sourceCurrency: "USD",
            targetCurrency: "INR",
            quotes: [
              {
                dateCollected: "2026-07-03T04:15:27.956047Z",
                fee: 0,
                rate: 95.2503387347,
                receivedAmount: 95250.34,
              },
            ],
          },
        ],
      },
    },
  },
};

function htmlWithNextData(data) {
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    data,
  )}</script></body></html>`;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    headers: { "content-type": "text/html" },
    status,
  });
}

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "xpat-fx-rates-"));
}

async function writeExistingFxArtifact(root, artifact) {
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await mkdir(join(root, "data", "curation"), { recursive: true });
  await writeFile(
    join(root, "data", "artifacts", "fx-snapshots.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function existingArtifact(snapshots = []) {
  return {
    meta: {
      caveats: ["test"],
      family: "fx-snapshots",
      generatedAt: "2026-07-06T00:00:00.000Z",
      method: "test",
      provenance: "snapshot",
      refreshCadence: "daily snapshot plus hourly runtime route",
      source: "test",
      version: 1,
    },
    data: {
      corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: 1000 },
      snapshots,
    },
  };
}

function successfulProviderFetch({ failWiseQuote = false } = {}) {
  return async (input, init) => {
    const href = String(input);

    if (href.includes("frankfurter")) {
      return jsonResponse([{ date: "2026-07-07", base: "USD", quote: "INR", rate: 95.4 }]);
    }

    if (href.includes("remitly-usd-to-inr")) {
      return textResponse(htmlWithNextData(nextData));
    }

    if (href.includes("xoom-exchange-rate")) {
      return textResponse(htmlWithNextData(nextData));
    }

    if (href.includes("api.wise.com")) {
      if (failWiseQuote) return jsonResponse({ error: "rate limited" }, 503);

      expect(init?.method).toBe("POST");
      return jsonResponse({
        createdTime: "2026-07-07T08:00:00Z",
        paymentOptions: [
          {
            disabled: false,
            fee: { total: 11.26 },
            payIn: "BANK_TRANSFER",
            payOut: "BANK_TRANSFER",
            targetAmount: 94140,
          },
        ],
        rate: 95.41,
      });
    }

    throw new Error(`Unexpected fetch ${href}`);
  };
}

describe("competitor FX snapshot pipeline", () => {
  it("extracts provider rows from Wise comparison page props", () => {
    expect(
      parseWiseComparisonQuote({
        html: htmlWithNextData(nextData),
        provider: "Remitly",
        alias: "remitly",
        sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
      }),
    ).toMatchObject({
      provider: "Remitly",
      quotedRate: 94.9135120672,
      feeUSD: 0,
      receiveAmountFor1000USD: 94913.51,
      method: "page",
      capturedAt: "2026-07-03T07:46:21.700407Z",
    });

    expect(
      parseWiseComparisonQuote({
        html: htmlWithNextData(nextData),
        provider: "Xoom",
        alias: "xoom",
        sourceUrl: "https://wise.com/us/compare/xoom-exchange-rate",
      }),
    ).toMatchObject({
      provider: "Xoom",
      quotedRate: 95.2503387347,
      feeUSD: 0,
      receiveAmountFor1000USD: 95250.34,
      method: "page",
      capturedAt: "2026-07-03T04:15:27.956047Z",
    });
  });

  it("keeps missing provider paths as connector-needed records", () => {
    expect(providerConnectorNeeded("Aspora", "No public machine-readable quote path found.")).toEqual({
      provider: "Aspora",
      quotedRate: null,
      feeUSD: null,
      receiveAmountFor1000USD: null,
      method: "connector-needed",
      sourceUrl: "https://www.aspora.com/us",
      capturedAt: null,
      caveat: "No public machine-readable quote path found.",
    });
  });

  it("uses complete manual quote overlays and ignores placeholder rows", () => {
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

    expect(
      manualQuoteFromOverlay("Xpat", {
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
      }),
    ).toMatchObject({
      provider: "Xpat",
      method: "manual",
      caveat: MANUAL_QUOTE_CAVEAT,
      receiveAmountFor1000USD: 94750,
    });
  });

  it("builds a provenance-stamped rolling snapshot artifact", () => {
    const artifact = buildFxSnapshotArtifact({
      generatedAt: "2026-07-03T00:00:00.000Z",
      midMarket: { rate: 95.3, source: "Frankfurter v2", asOf: "2026-07-03" },
      providers: [
        {
          provider: "Wise",
          quotedRate: 95.335,
          feeUSD: 6.85,
          receiveAmountFor1000USD: 94681.96,
          method: "api",
          sourceUrl: "https://api.wise.com/v3/quotes",
          capturedAt: "2026-07-03T08:12:14Z",
        },
      ],
      previousSnapshots: [
        {
          capturedAt: "2026-04-01T00:00:00.000Z",
          midMarket: { rate: 83, source: "old", asOf: "2026-04-01" },
          providers: [],
        },
        {
          capturedAt: "2026-07-03T09:00:00.000Z",
          midMarket: { rate: 94, source: "duplicate", asOf: "2026-07-03" },
          providers: [],
        },
      ],
    });

    expect(artifact.meta).toMatchObject({
      family: "fx-snapshots",
      provenance: "snapshot",
      refreshCadence: "daily snapshot plus hourly runtime route",
    });
    expect(artifact.data.snapshots).toHaveLength(1);
    expect(artifact.data.snapshots[0]).toMatchObject({
      capturedAt: "2026-07-03T00:00:00.000Z",
      midMarket: { rate: 95.3 },
    });
  });

  it("does not fetch or duplicate rows when the latest snapshot already covers the generated day", async () => {
    const root = tempRoot();
    await writeExistingFxArtifact(
      root,
      existingArtifact([
        {
          capturedAt: "2026-07-07T00:00:00.000Z",
          midMarket: { rate: 95.4, source: "Frankfurter v2", asOf: "2026-07-07" },
          providers: [],
        },
      ]),
    );
    const calls = [];
    const artifact = await runRates({
      fetchImpl: async (input) => {
        calls.push(String(input));
        throw new Error("same-day run should not fetch");
      },
      generatedAt: "2026-07-07T00:00:00.000Z",
      root,
    });

    expect(calls).toEqual([]);
    expect(artifact.data.snapshots.map((snapshot) => snapshot.capturedAt.slice(0, 10))).toEqual([
      "2026-07-07",
    ]);
  });

  it("captures successful providers when the Wise quote fetch is blocked", async () => {
    const root = tempRoot();
    await writeExistingFxArtifact(
      root,
      existingArtifact([
        {
          capturedAt: "2026-07-06T00:00:00.000Z",
          midMarket: { rate: 95.2, source: "Frankfurter v2", asOf: "2026-07-06" },
          providers: [],
        },
      ]),
    );

    await runRates({
      fetchImpl: successfulProviderFetch({ failWiseQuote: true }),
      generatedAt: "2026-07-07T00:00:00.000Z",
      root,
    });

    const artifact = JSON.parse(
      await readFile(join(root, "data", "artifacts", "fx-snapshots.json"), "utf8"),
    );
    const latest = artifact.data.snapshots.at(-1);

    expect(latest.capturedAt).toBe("2026-07-07T00:00:00.000Z");
    expect(latest.providers.find((provider) => provider.provider === "Remitly")).toMatchObject({
      method: "page",
      quotedRate: 94.9135120672,
    });
    expect(latest.providers.find((provider) => provider.provider === "Xoom")).toMatchObject({
      method: "page",
      quotedRate: 95.2503387347,
    });
    expect(latest.providers.find((provider) => provider.provider === "Wise")).toMatchObject({
      caveat: "Wise unauthenticated quote returned HTTP 503.",
      method: "connector-needed",
      quotedRate: null,
    });
  });

  it("keeps the committed fx snapshot artifact schema-valid with unique capture days", async () => {
    const artifact = JSON.parse(
      await readFile(join(process.cwd(), "data", "artifacts", "fx-snapshots.json"), "utf8"),
    );
    const days = artifact.data.snapshots.map((snapshot) => snapshot.capturedAt.slice(0, 10));

    expect(artifact.meta).toMatchObject({
      family: "fx-snapshots",
      provenance: "snapshot",
      refreshCadence: "daily snapshot plus hourly runtime route",
    });
    expect(new Set(days).size).toBe(days.length);
    expect(artifact.data.corridor).toMatchObject({
      sourceCurrency: "USD",
      targetCurrency: "INR",
      sendAmountUSD: 1000,
    });

    for (const snapshot of artifact.data.snapshots) {
      expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
      expect(typeof snapshot.midMarket.rate).toBe("number");
      expect(snapshot.providers.length).toBeGreaterThan(0);

      for (const provider of snapshot.providers) {
        expect(provider.provider).toBeTruthy();
        expect(provider.method).toMatch(/^(api|page|manual|connector-needed)$/u);
        expect(provider.sourceUrl).toMatch(/^https:\/\//u);
        if (provider.method === "connector-needed") {
          expect(provider.quotedRate).toBeNull();
          expect(provider.caveat).toBeTruthy();
        } else {
          expect(typeof provider.quotedRate).toBe("number");
          expect(typeof provider.receiveAmountFor1000USD).toBe("number");
        }
      }
    }
  });
});
