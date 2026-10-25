import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";

const SEND_AMOUNT_USD = 1000;
const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR";
const WISE_QUOTE_URL = "https://api.wise.com/v3/quotes";
const MANUAL_QUOTES_FILE = join("data", "curation", "fx-manual-quotes.json");
export const MANUAL_QUOTE_CAVEAT =
  "hand-captured from public pages; no quote endpoint exists for automation.";

const providerSourceUrls = {
  Xpat: "https://xpat.money/",
  Remitly: "https://wise.com/us/compare/remitly-usd-to-inr",
  Wise: WISE_QUOTE_URL,
  Xoom: "https://wise.com/us/compare/xoom-exchange-rate",
  "Western Union": "https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html",
  Aspora: "https://www.aspora.com/us",
  Crobo: "https://www.crobo.money/",
};

function todayGeneratedAt() {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

async function readJson(response, label) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  return response.json();
}

async function readText(response, label) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  return response.text();
}

async function fetchFrankfurterMidMarket(fetchImpl = fetch) {
  const rows = await readJson(await fetchImpl(FRANKFURTER_URL), "Frankfurter USD to INR");
  if (!Array.isArray(rows)) {
    throw new Error("Frankfurter USD to INR response must be an array.");
  }

  const row = rows.find((entry) => entry?.base === "USD" && entry?.quote === "INR");
  if (!row) {
    throw new Error("Frankfurter USD to INR response did not include USD/INR.");
  }

  return {
    rate: assertFiniteNumber(row.rate, "Frankfurter rate"),
    source: "Frankfurter v2",
    asOf: String(row.date),
  };
}

function wisePaymentOption(json) {
  const options = Array.isArray(json.paymentOptions) ? json.paymentOptions : [];
  const available = options.filter((option) => option && option.disabled !== true);

  return (
    available.find(
      (option) => option.payIn === "BANK_TRANSFER" && option.payOut === "BANK_TRANSFER",
    ) ?? available[0]
  );
}

function wiseFeeTotal(option) {
  if (option.fee?.total !== undefined) {
    return assertFiniteNumber(option.fee.total, "Wise fee total");
  }

  if (option.price?.total?.value?.amount !== undefined) {
    return assertFiniteNumber(option.price.total.value.amount, "Wise price total");
  }

  throw new Error("Wise quote did not include a fee total.");
}

async function fetchWiseQuote(fetchImpl = fetch) {
  const json = await readJson(
    await fetchImpl(WISE_QUOTE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceCurrency: "USD",
        targetCurrency: "INR",
        sourceAmount: SEND_AMOUNT_USD,
      }),
    }),
    "Wise unauthenticated quote",
  );
  const option = wisePaymentOption(json);

  if (!option) {
    throw new Error("Wise quote did not include an available payment option.");
  }

  return {
    provider: "Wise",
    quotedRate: assertFiniteNumber(json.rate, "Wise rate"),
    feeUSD: wiseFeeTotal(option),
    receiveAmountFor1000USD: assertFiniteNumber(option.targetAmount, "Wise target amount"),
    method: "api",
    sourceUrl: WISE_QUOTE_URL,
    capturedAt: String(json.createdTime ?? new Date().toISOString()),
  };
}

function nextDataFromHtml(html) {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(?<json>.*?)<\/script>/s,
  );

  if (!match?.groups?.json) {
    throw new Error("Wise comparison page did not include __NEXT_DATA__.");
  }

  return JSON.parse(match.groups.json);
}

function quoteFromProviderRouteData(pageProps, alias) {
  if (pageProps.providerRouteData?.alias !== alias) return undefined;

  const route = pageProps.providerRouteData.routes?.find(
    (candidate) => candidate.sourceCurrency === "USD" && candidate.targetCurrency === "INR",
  );

  return route?.quotes?.[0];
}

export function parseWiseComparisonQuote({ html, provider, alias, sourceUrl }) {
  const data = nextDataFromHtml(html);
  const pageProps = data.props?.pageProps;
  const quote =
    pageProps?.quotes?.find((candidate) => candidate.alias === alias) ??
    quoteFromProviderRouteData(pageProps, alias);

  if (!quote) {
    throw new Error(`Wise comparison page did not include ${provider}.`);
  }

  return {
    provider,
    quotedRate: assertFiniteNumber(quote.rate, `${provider} rate`),
    feeUSD: assertFiniteNumber(quote.fees ?? quote.fee ?? 0, `${provider} fee`),
    receiveAmountFor1000USD: assertFiniteNumber(
      quote.receivedAmount,
      `${provider} received amount`,
    ),
    method: "page",
    sourceUrl,
    capturedAt: String(quote.dateCollected),
  };
}

export function providerConnectorNeeded(provider, caveat) {
  return {
    provider,
    quotedRate: null,
    feeUSD: null,
    receiveAmountFor1000USD: null,
    method: "connector-needed",
    sourceUrl: providerSourceUrls[provider],
    capturedAt: null,
    caveat,
  };
}

function isCompleteManualQuote(row) {
  return Boolean(
    row &&
      row.method === "manual" &&
      typeof row.quotedRate === "number" &&
      Number.isFinite(row.quotedRate) &&
      typeof row.feeUSD === "number" &&
      Number.isFinite(row.feeUSD) &&
      typeof row.receiveAmountFor1000USD === "number" &&
      Number.isFinite(row.receiveAmountFor1000USD) &&
      typeof row.capturedAt === "string" &&
      row.capturedAt.length > 0,
  );
}

export function manualQuoteFromOverlay(provider, overlay) {
  const row = overlay?.quotes?.find((candidate) => candidate.provider === provider);
  if (!isCompleteManualQuote(row)) return undefined;

  return {
    ...row,
    caveat: row.caveat ?? MANUAL_QUOTE_CAVEAT,
  };
}

function withinRollingWindow(snapshot, generatedAt) {
  const generated = new Date(generatedAt).getTime();
  const captured = new Date(snapshot.capturedAt).getTime();
  const days = (generated - captured) / (24 * 60 * 60 * 1000);

  return days >= 0 && days <= 90;
}

function captureDay(snapshot) {
  return snapshot.capturedAt.slice(0, 10);
}

function mergeSnapshotsByCaptureDay({ generatedAt, nextSnapshot, previousSnapshots }) {
  const byDay = new Map();

  for (const snapshot of previousSnapshots.filter((row) => withinRollingWindow(row, generatedAt))) {
    byDay.set(captureDay(snapshot), snapshot);
  }

  byDay.set(captureDay(nextSnapshot), nextSnapshot);

  return [...byDay.values()].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

export function buildFxSnapshotArtifact({
  generatedAt = todayGeneratedAt(),
  midMarket,
  providers,
  previousSnapshots = [],
}) {
  const nextSnapshot = {
    capturedAt: generatedAt,
    midMarket,
    providers,
  };

  return {
    meta: {
      family: "fx-snapshots",
      version: 1,
      generatedAt,
      provenance: "snapshot",
      source: "Frankfurter v2, Wise unauthenticated quote, Wise public comparison pages, provider public pages",
      method:
        "Daily USD to INR snapshot for the runtime fallback. Frankfurter and Wise are fetched through documented JSON APIs; Remitly and Xoom are parsed from Wise public comparison pages; Xpat can use a curated manual public-page quote overlay when filled. Xpat, Western Union, Aspora, and Crobo stay connector-needed until a stable public machine-readable quote path is verified.",
      refreshCadence: "daily snapshot plus hourly runtime route",
      caveats: [
        "Provider page snapshots are public list-price evidence only and can change without notice.",
        "Public FX quotes do not prove conversion, CAC, spend, targeting, or performance.",
        "Xpat remains connector-needed unless a hand-captured public-page quote overlay has complete numbers and capturedAt.",
        "Western Union, Aspora, and Crobo remain connector-needed where no stable public machine-readable quote path was verified.",
      ],
    },
    data: {
      corridor: { sourceCurrency: "USD", targetCurrency: "INR", sendAmountUSD: SEND_AMOUNT_USD },
      snapshots: mergeSnapshotsByCaptureDay({ generatedAt, nextSnapshot, previousSnapshots }),
    },
  };
}

function latestSnapshotDate(artifact) {
  return artifact?.data?.snapshots
    ?.map((snapshot) => snapshot.capturedAt.slice(0, 10))
    .sort()
    .at(-1);
}

function readExistingArtifact(filePath) {
  if (!existsSync(filePath)) return undefined;

  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function fetchWiseComparisonProvider({ provider, alias, sourceUrl, fetchImpl }) {
  const html = await readText(
    await fetchImpl(sourceUrl, {
      headers: { "user-agent": "xpat-os/0.1 (+https://xpat.money)" },
    }),
    `${provider} Wise comparison page`,
  );

  return parseWiseComparisonQuote({ html, provider, alias, sourceUrl });
}

export async function runRates({
  root = process.cwd(),
  fetchImpl = fetch,
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
} = {}) {
  const filePath = join(root, "data", "artifacts", "fx-snapshots.json");
  const existing = readExistingArtifact(filePath);
  const manualOverlay = readExistingArtifact(join(root, MANUAL_QUOTES_FILE));

  if (latestSnapshotDate(existing) === generatedAt.slice(0, 10)) {
    return existing;
  }

  const midMarket = await fetchFrankfurterMidMarket(fetchImpl);
  const providers = [
    manualQuoteFromOverlay("Xpat", manualOverlay) ??
      providerConnectorNeeded("Xpat", "Xpat public pages do not expose a stable quote JSON path."),
    await fetchWiseComparisonProvider({
      provider: "Remitly",
      alias: "remitly",
      sourceUrl: providerSourceUrls.Remitly,
      fetchImpl,
    }).catch((error) =>
      providerConnectorNeeded(
        "Remitly",
        error instanceof Error ? error.message : "Remitly comparison capture failed.",
      ),
    ),
    await fetchWiseQuote(fetchImpl).catch((error) =>
      providerConnectorNeeded(
        "Wise",
        error instanceof Error ? error.message : "Wise unauthenticated quote failed.",
      ),
    ),
    await fetchWiseComparisonProvider({
      provider: "Xoom",
      alias: "xoom",
      sourceUrl: providerSourceUrls.Xoom,
      fetchImpl,
    }).catch((error) =>
      providerConnectorNeeded(
        "Xoom",
        error instanceof Error ? error.message : "Xoom comparison capture failed.",
      ),
    ),
    providerConnectorNeeded(
      "Western Union",
      "Western Union public pages did not expose a stable quote JSON path.",
    ),
    providerConnectorNeeded("Aspora", "No public machine-readable quote path found."),
    providerConnectorNeeded("Crobo", "No public machine-readable quote path found."),
  ];

  const artifact = buildFxSnapshotArtifact({
    generatedAt,
    midMarket,
    providers,
    previousSnapshots: existing?.data?.snapshots ?? [],
  });

  await writeDeterministicJson(filePath, artifact);
  return artifact;
}
