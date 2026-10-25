import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORLD_BANK_INDICATOR = "BX.TRF.PWKR.CD.DT";
const WORLD_BANK_URL = `https://api.worldbank.org/v2/country/IND/indicator/${WORLD_BANK_INDICATOR}?format=json&per_page=5`;

export function dailyGeneratedAt(value = new Date().toISOString()) {
  return `${value.slice(0, 10)}T00:00:00.000Z`;
}

function addUtcYears(dateString, years) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function frankfurterHistoryUrl(generatedAt = dailyGeneratedAt()) {
  const endDate = generatedAt.slice(0, 10);
  const startDate = addUtcYears(endDate, -1);
  return `https://api.frankfurter.dev/v1/${startDate}..${endDate}?from=USD&to=INR`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status}`);
  }
  return response.json();
}

async function writeArtifact(root, file, artifact) {
  const path = join(root, "data", "artifacts", file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
}

function connectorNeededArtifact({
  error,
  family,
  generatedAt,
  refreshCadence,
  source,
}) {
  return {
    data: null,
    meta: {
      caveats: [
        "Source fetch failed during pipeline refresh.",
        "No derived value is emitted until the source is reachable again.",
      ],
      error: error instanceof Error ? error.message : String(error),
      family,
      generatedAt,
      method: "Connector-needed failure artifact emitted by playbook-context pipeline.",
      provenance: "connector-needed",
      refreshCadence,
      source,
      version: 1,
    },
  };
}

function connectorNeededForSource(error, {
  family,
  generatedAt,
  refreshCadence,
  source,
}) {
  return connectorNeededArtifact({
    error,
    family,
    generatedAt,
    refreshCadence,
    source,
  });
}

function latestWorldBankValue(worldBank) {
  const rows = Array.isArray(worldBank?.[1]) ? worldBank[1] : [];
  const latestIndiaRow = rows.find((row) => row?.value !== null && row?.value !== undefined);
  const amountUsd = Number(latestIndiaRow?.value);
  const year = Number(latestIndiaRow?.date);

  if (!Number.isFinite(amountUsd) || !Number.isFinite(year)) {
    throw new Error("World Bank payload missing India remittance value");
  }

  return { amountUsd, year };
}

function usdToInrHistory(fx) {
  if (!fx || typeof fx !== "object" || !fx.rates || typeof fx.rates !== "object") {
    throw new Error("Frankfurter payload missing rates");
  }

  const rates = Object.entries(fx.rates).map(([date, values]) => ({
    date,
    rate: Number(values?.INR),
  }));

  if (!rates.length || rates.some((point) => !Number.isFinite(point.rate))) {
    throw new Error("Frankfurter payload missing USD to INR history");
  }

  return rates;
}

async function settleFetch(fetchJsonImpl, url) {
  try {
    return { data: await fetchJsonImpl(url), ok: true };
  } catch (error) {
    return { error, ok: false };
  }
}

export async function runPlaybookContext({
  fetchJsonImpl = fetchJson,
  generatedAt = dailyGeneratedAt(process.env.PIPELINE_GENERATED_AT ?? new Date().toISOString()),
  root = ROOT,
} = {}) {
  const frankfurterUrl = frankfurterHistoryUrl(generatedAt);
  const [worldBankResult, fxResult] = await Promise.all([
    settleFetch(fetchJsonImpl, WORLD_BANK_URL),
    settleFetch(fetchJsonImpl, frankfurterUrl),
  ]);

  if (worldBankResult.ok) {
    try {
      const latestIndiaRow = latestWorldBankValue(worldBankResult.data);
      await writeArtifact(root, "corridor-context.json", {
        data: {
          indiaInboundRemittances: {
            amountUsd: latestIndiaRow.amountUsd,
            sourceLabel: "World Bank Open Data, personal remittances received",
            sourceUrl:
              "https://data.worldbank.org/indicator/BX.TRF.PWKR.CD.DT?locations=IN",
            year: latestIndiaRow.year,
          },
          method:
            "Derived metro estimate = US-to-India corridor estimate multiplied by the market share of national Asian Indian population.",
          rounding:
            "Display rounds to one decimal billion for values above $1B, nearest $100M below $1B, and never implies precision.",
          usShare: {
            sourceLabel: "RBI Bulletin March 2025, Sixth Round of India's Remittances Survey",
            sourceUrl: "https://rbi.org.in/scripts/BS_ViewBulletin.aspx?Id=23260",
            valuePct: 27.7,
            yearLabel: "2023-24",
          },
        },
        meta: {
          caveats: [
            "Per-market values are derived order-of-magnitude estimates.",
            "The allocation uses Asian Indian population share, not observed Xpat transfers."
          ],
          family: "corridor-context",
          generatedAt,
          method:
            "Fetched World Bank India inbound remittances and combined them with the latest RBI US-source share for a derived corridor estimate.",
          provenance: "derived",
          refreshCadence: "annual when World Bank and RBI remittance data refresh",
          source: "World Bank Open Data and RBI Bulletin",
          version: 1,
        },
      });
    } catch (error) {
      await writeArtifact(root, "corridor-context.json", connectorNeededForSource(error, {
        family: "corridor-context",
        generatedAt,
        refreshCadence: "annual when World Bank and RBI remittance data refresh",
        source: "World Bank Open Data and RBI Bulletin",
      }));
    }
  } else {
    await writeArtifact(root, "corridor-context.json", connectorNeededForSource(worldBankResult.error, {
      family: "corridor-context",
      generatedAt,
      refreshCadence: "annual when World Bank and RBI remittance data refresh",
      source: "World Bank Open Data and RBI Bulletin",
    }));
  }

  if (fxResult.ok) {
    try {
      const fx = fxResult.data;
      const usdToInr = usdToInrHistory(fx);
      await writeArtifact(root, "fx-history.json", {
        data: {
          base: fx.base,
          current: usdToInr.at(-1),
          endDate: fx.end_date,
          rates: usdToInr,
          sourceUrl: frankfurterUrl,
          startDate: fx.start_date,
          target: "INR",
        },
        meta: {
          caveats: [
            "Historical ECB reference rates only.",
            "Rate history is not a forecast and does not prove remittance behavior."
          ],
          family: "fx-history",
          generatedAt,
          method: "Fetched 12 months of USD to INR rates from Frankfurter historical time-series endpoint.",
          provenance: "grounded",
          refreshCadence: "daily or before demos",
          source: "Frankfurter API, ECB reference rates",
          version: 1,
        },
      });
    } catch (error) {
      await writeArtifact(root, "fx-history.json", connectorNeededForSource(error, {
        family: "fx-history",
        generatedAt,
        refreshCadence: "daily or before demos",
        source: "Frankfurter API, ECB reference rates",
      }));
    }
  } else {
    await writeArtifact(root, "fx-history.json", connectorNeededForSource(fxResult.error, {
      family: "fx-history",
      generatedAt,
      refreshCadence: "daily or before demos",
      source: "Frankfurter API, ECB reference rates",
    }));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPlaybookContext().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
