export const SEND_AMOUNT_USD = 1000;
export const MANUAL_QUOTE_CAVEAT =
  "hand-captured from public pages; no quote endpoint exists for automation.";

export const providerOrder = [
  "Xpat",
  "Remitly",
  "Wise",
  "Xoom",
  "Western Union",
  "Aspora",
  "Crobo",
] as const;

export type FxProviderName = (typeof providerOrder)[number];
export type FxProviderStatus = "live" | "snapshot" | "manual" | "connector-needed";
export type FxProviderMethod = "api" | "page" | "manual" | "connector-needed";

export type FxMidMarket = {
  rate: number;
  source: string;
  asOf: string;
};

export type FxProviderSnapshot = {
  provider: FxProviderName;
  quotedRate: number | null;
  feeUSD: number | null;
  receiveAmountFor1000USD: number | null;
  sendAmountUSD?: number;
  method: FxProviderMethod;
  sourceUrl: string;
  capturedAt: string | null;
  caveat?: string;
};

export type FxProviderQuote = FxProviderSnapshot & {
  status: FxProviderStatus;
  effectiveMarginPctVsMid: number | null;
};

export type FxSnapshot = {
  capturedAt: string;
  midMarket: FxMidMarket;
  providers: readonly FxProviderSnapshot[];
};

export type FxSnapshotArtifact = {
  data: {
    corridor: {
      sourceCurrency: "USD";
      targetCurrency: "INR";
      sendAmountUSD: number;
    };
    snapshots: readonly FxSnapshot[];
  };
};

export type FxManualQuoteOverlayRow = {
  provider: FxProviderName;
  quotedRate: number | null;
  feeUSD: number | null;
  receiveAmountFor1000USD: number | null;
  sendAmountUSD?: number;
  method: "manual";
  sourceUrl: string;
  capturedAt: string | null;
  caveat?: string;
};

export type FxManualQuoteOverlay = {
  notes?: string;
  quotes?: readonly FxManualQuoteOverlayRow[];
};

export type FxPayload = {
  corridor: {
    sourceCurrency: "USD";
    targetCurrency: "INR";
    sendAmountUSD: number;
  };
  generatedAt: string;
  provenance: "live" | "snapshot";
  fallbackReason?: string;
  midMarket: FxMidMarket;
  providers: FxProviderQuote[];
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR";
const WISE_QUOTE_URL = "https://api.wise.com/v3/quotes";

const providerSourceUrls: Record<FxProviderName, string> = {
  Xpat: "https://xpat.money/",
  Remitly: "https://wise.com/us/compare/remitly-usd-to-inr",
  Wise: WISE_QUOTE_URL,
  Xoom: "https://wise.com/us/compare/xoom-exchange-rate",
  "Western Union": "https://www.westernunion.com/us/en/currency-converter/usd-to-inr-rate.html",
  Aspora: "https://www.aspora.com/us",
  Crobo: "https://www.crobo.money/",
};

function assertNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJson(response: Response, label: string) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  return response.json() as Promise<unknown>;
}

export function latestFxSnapshot(artifact: FxSnapshotArtifact) {
  const latest = [...artifact.data.snapshots].sort((left, right) =>
    right.capturedAt.localeCompare(left.capturedAt),
  )[0];

  if (!latest) {
    throw new Error("fx-snapshots artifact does not contain any snapshots.");
  }

  return latest;
}

export async function fetchFrankfurterMidMarket(fetchImpl: FetchLike = fetch) {
  const json = await readJson(await fetchImpl(FRANKFURTER_URL), "Frankfurter USD to INR");

  if (!Array.isArray(json)) {
    throw new Error("Frankfurter USD to INR response must be an array.");
  }

  const row = json.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "base" in entry &&
      entry.base === "USD" &&
      "quote" in entry &&
      entry.quote === "INR",
  );

  if (!row || typeof row !== "object") {
    throw new Error("Frankfurter USD to INR response did not include a USD/INR row.");
  }

  return {
    rate: assertNumber("rate" in row ? row.rate : undefined, "Frankfurter rate"),
    source: "Frankfurter v2",
    asOf: String("date" in row ? row.date : ""),
  };
}

function wisePaymentOption(json: Record<string, unknown>) {
  const options = Array.isArray(json.paymentOptions) ? json.paymentOptions : [];
  const availableOptions = options.filter(
    (option): option is Record<string, unknown> =>
      Boolean(option) &&
      typeof option === "object" &&
      !("disabled" in option && option.disabled === true),
  );

  return (
    availableOptions.find(
      (option) => option.payIn === "BANK_TRANSFER" && option.payOut === "BANK_TRANSFER",
    ) ?? availableOptions[0]
  );
}

function optionFeeTotal(option: Record<string, unknown>) {
  const fee = option.fee;
  if (fee && typeof fee === "object" && "total" in fee) {
    return assertNumber(fee.total, "Wise fee total");
  }

  const price = option.price;
  if (
    price &&
    typeof price === "object" &&
    "total" in price &&
    price.total &&
    typeof price.total === "object" &&
    "value" in price.total &&
    price.total.value &&
    typeof price.total.value === "object" &&
    "amount" in price.total.value
  ) {
    return assertNumber(price.total.value.amount, "Wise price total");
  }

  throw new Error("Wise quote did not include a fee total.");
}

export async function fetchWiseQuote(
  fetchImpl: FetchLike = fetch,
  sendAmountUSD = SEND_AMOUNT_USD,
): Promise<FxProviderSnapshot> {
  const response = await fetchImpl(WISE_QUOTE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceCurrency: "USD",
      targetCurrency: "INR",
      sourceAmount: sendAmountUSD,
    }),
  });
  const json = await readJson(response, "Wise unauthenticated quote");

  if (!json || typeof json !== "object") {
    throw new Error("Wise quote response must be an object.");
  }

  const option = wisePaymentOption(json as Record<string, unknown>);
  if (!option) {
    throw new Error("Wise quote did not include an available payment option.");
  }

  return {
    provider: "Wise",
    quotedRate: assertNumber("rate" in json ? json.rate : undefined, "Wise rate"),
    feeUSD: optionFeeTotal(option),
    receiveAmountFor1000USD: assertNumber(option.targetAmount, "Wise target amount"),
    sendAmountUSD,
    method: "api",
    sourceUrl: WISE_QUOTE_URL,
    capturedAt: String("createdTime" in json ? json.createdTime : new Date().toISOString()),
  };
}

function effectiveMarginPctVsMid(
  provider: FxProviderSnapshot,
  midMarketRate: number,
  sendAmountUSD = SEND_AMOUNT_USD,
) {
  if (provider.receiveAmountFor1000USD === null) return null;

  const effectiveRate = provider.receiveAmountFor1000USD / sendAmountUSD;
  return round(((midMarketRate - effectiveRate) / midMarketRate) * 100);
}

function quoteBaseAmount(provider: FxProviderSnapshot) {
  return provider.sendAmountUSD ?? SEND_AMOUNT_USD;
}

function receiveForSendAmount(provider: FxProviderSnapshot, sendAmountUSD: number) {
  if (provider.quotedRate === null || provider.receiveAmountFor1000USD === null) return null;
  if (quoteBaseAmount(provider) === sendAmountUSD) return provider.receiveAmountFor1000USD;

  const feeUSD = provider.feeUSD ?? 0;
  return round(provider.quotedRate * Math.max(sendAmountUSD - feeUSD, 0));
}

function withSendAmount(provider: FxProviderSnapshot, sendAmountUSD: number): FxProviderSnapshot {
  const receiveAmount = receiveForSendAmount(provider, sendAmountUSD);

  if (receiveAmount === null) return provider;

  return {
    ...provider,
    receiveAmountFor1000USD: receiveAmount,
    sendAmountUSD,
  };
}

function providerUnavailable(provider: FxProviderName, caveat: string): FxProviderSnapshot {
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

function isCompleteManualQuote(
  row: FxManualQuoteOverlayRow | undefined,
): row is FxManualQuoteOverlayRow & {
  capturedAt: string;
  feeUSD: number;
  quotedRate: number;
  receiveAmountFor1000USD: number;
} {
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

export function manualQuoteFromOverlay(
  provider: FxProviderName,
  overlay?: FxManualQuoteOverlay,
): FxProviderSnapshot | undefined {
  const row = overlay?.quotes?.find((candidate) => candidate.provider === provider);
  if (!isCompleteManualQuote(row)) return undefined;

  return {
    ...row,
    caveat: row.caveat ?? MANUAL_QUOTE_CAVEAT,
  };
}

function statusForProvider(provider: FxProviderSnapshot): FxProviderStatus {
  if (provider.method === "manual") return "manual";
  return provider.quotedRate === null ? "connector-needed" : "snapshot";
}

function withStatus(
  provider: FxProviderSnapshot,
  status: FxProviderStatus,
  midMarketRate: number,
  sendAmountUSD = SEND_AMOUNT_USD,
): FxProviderQuote {
  return {
    ...provider,
    status,
    effectiveMarginPctVsMid: effectiveMarginPctVsMid(provider, midMarketRate, sendAmountUSD),
  };
}

function snapshotProvider(snapshot: FxSnapshot, provider: FxProviderName) {
  return snapshot.providers.find((row) => row.provider === provider);
}

export function snapshotFxPayload(
  snapshotArtifact: FxSnapshotArtifact,
  generatedAt = new Date().toISOString(),
  fallbackReason?: string,
  manualQuotes?: FxManualQuoteOverlay,
  sendAmountUSD = SEND_AMOUNT_USD,
): FxPayload {
  const latest = latestFxSnapshot(snapshotArtifact);

  return {
    corridor: {
      ...snapshotArtifact.data.corridor,
      sendAmountUSD,
    },
    generatedAt,
    provenance: "snapshot",
    fallbackReason,
    midMarket: latest.midMarket,
    providers: providerOrder.map((provider) => {
      const row =
        manualQuoteFromOverlay(provider, manualQuotes) ??
        snapshotProvider(latest, provider) ??
        providerUnavailable(provider, "No committed provider quote in the latest snapshot.");

      const amountRow = withSendAmount(row, sendAmountUSD);
      return withStatus(amountRow, statusForProvider(amountRow), latest.midMarket.rate, sendAmountUSD);
    }),
  };
}

export async function buildFxPayload({
  fetchImpl = fetch,
  manualQuotes,
  sendAmountUSD = SEND_AMOUNT_USD,
  snapshotArtifact,
}: {
  fetchImpl?: FetchLike;
  manualQuotes?: FxManualQuoteOverlay;
  sendAmountUSD?: number;
  snapshotArtifact: FxSnapshotArtifact;
}): Promise<FxPayload> {
  let midMarket: FxMidMarket;

  try {
    midMarket = await fetchFrankfurterMidMarket(fetchImpl);
  } catch (error) {
    return snapshotFxPayload(
      snapshotArtifact,
      new Date().toISOString(),
      `Frankfurter live mid-market unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
      manualQuotes,
      sendAmountUSD,
    );
  }

  const latest = latestFxSnapshot(snapshotArtifact);
  let wiseQuote: FxProviderSnapshot | undefined;
  let wiseQuoteIsLive = false;

  try {
    wiseQuote = await fetchWiseQuote(fetchImpl, sendAmountUSD);
    wiseQuoteIsLive = true;
  } catch {
    wiseQuote = snapshotProvider(latest, "Wise");
  }

  return {
    corridor: {
      ...snapshotArtifact.data.corridor,
      sendAmountUSD,
    },
    generatedAt: new Date().toISOString(),
    provenance: "live",
    midMarket,
    providers: providerOrder.map((provider) => {
      if (provider === "Wise" && wiseQuote) {
        const amountRow = wiseQuoteIsLive ? wiseQuote : withSendAmount(wiseQuote, sendAmountUSD);

        return withStatus(
          amountRow,
          wiseQuoteIsLive ? "live" : statusForProvider(amountRow),
          midMarket.rate,
          sendAmountUSD,
        );
      }

      const fromSnapshot = manualQuoteFromOverlay(provider, manualQuotes) ?? snapshotProvider(latest, provider);
      const providerRecord =
        fromSnapshot ??
        providerUnavailable(provider, "No clean public quote path verified for this provider.");
      const amountRow = withSendAmount(providerRecord, sendAmountUSD);

      return withStatus(amountRow, statusForProvider(amountRow), midMarket.rate, sendAmountUSD);
    }),
  };
}
