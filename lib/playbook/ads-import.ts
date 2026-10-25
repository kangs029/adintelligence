import type { Market } from "@/lib/data/markets";

const MIN_CONVERSIONS_FOR_TRUST = 10;

const HEADER_SYNONYMS = {
  baselineGroup: ["baseline_group", "baseline", "group", "arm", "cohort", "test_group"],
  campaign: ["campaign", "campaign_name", "ad_group", "adgroup"],
  clicks: ["clicks", "link_clicks", "taps"],
  conversions: ["conversions", "conv", "results", "total_conversions", "purchases"],
  costUsd: ["spend", "cost", "cost_usd", "total_cost"],
  firstTransfers: ["first_transfers"],
  geoName: ["geo_name", "market", "market_name", "metro"],
  impressions: ["impressions", "impr", "imp", "views"],
  marketGeoid: ["market_geoid", "geoid", "geo_id", "market_id", "cbsa", "cbsa_geoid"],
  platform: ["platform", "channel", "source", "ad_platform", "publisher"],
  sampleData: ["sample_data", "demo_sample", "sample"],
  state: ["state", "region", "state_code", "province", "state_region"],
} as const;

type CanonicalHeader = keyof typeof HEADER_SYNONYMS;

export type ImportedAdsRow = {
  baselineGroup: string | null;
  campaign: string | null;
  clicks: number | null;
  conversions: number | null;
  costUsd: number | null;
  firstTransfers: number;
  hasFirstTransferEvidence: boolean;
  geoName: string | null;
  impressions: number | null;
  isSampleData: boolean;
  marketGeoid: string | null;
  platform: string | null;
  rowNumber: number;
  state: string | null;
};

export type MappedMarketPerformance = {
  clicks: number | null;
  conversions: number | null;
  costUsd: number | null;
  firstTransfers: number;
  hasFirstTransferEvidence: boolean;
  impressions: number | null;
  marketGeoid: string;
  trusted: boolean;
  rowCount: number;
};

export type UnmappedAdsRow = ImportedAdsRow & {
  reason: string;
};

export type AdsImportResult = {
  baselineRows: ImportedAdsRow[];
  mappedMarkets: MappedMarketPerformance[];
  rows: ImportedAdsRow[];
  sampleMappedMarkets: MappedMarketPerformance[];
  sampleRows: ImportedAdsRow[];
  sampleUnmappedRows: UnmappedAdsRow[];
  schema: {
    missingRecommendedHeaders: string[];
    resolvedHeaders: Partial<Record<CanonicalHeader, string>>;
  };
  unmappedRows: UnmappedAdsRow[];
};

type MarketLookup = {
  byGeoid: Map<string, Market>;
  byNameState: Map<string, Market[]>;
};

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/u, "").trim().toLowerCase().replace(/[\s-]+/gu, "_");
}

function normalizeGeo(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/metropolitan statistical area|metro area|msa/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function normalizeState(value: string) {
  return value.trim().toUpperCase();
}

function parseNumericCell(value: string | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.replace(/[$,%\s,]/gu, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSampleCell(value: string | undefined) {
  if (!value?.trim()) return false;
  return /^(1|true|yes|y|demo|sample)$/iu.test(value.trim());
}

function parseOptionalMetric(row: string[], indexes: Partial<Record<CanonicalHeader, number>>, key: CanonicalHeader) {
  return indexes[key] === undefined ? null : parseNumericCell(valueAt(row, indexes, key));
}

function normalizeMarketGeoid(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  return /^\d{5}$/u.test(trimmed) ? `31000US${trimmed}` : trimmed;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function resolveHeaders(headerRow: string[]) {
  const normalized = headerRow.map(normalizeHeader);
  const resolvedHeaders: Partial<Record<CanonicalHeader, string>> = {};
  const indexes: Partial<Record<CanonicalHeader, number>> = {};

  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS) as Array<
    [CanonicalHeader, readonly string[]]
  >) {
    const index = normalized.findIndex((header) => synonyms.includes(header));
    if (index >= 0) {
      indexes[canonical] = index;
      resolvedHeaders[canonical] = headerRow[index];
    }
  }

  return { indexes, resolvedHeaders };
}

function valueAt(row: string[], indexes: Partial<Record<CanonicalHeader, number>>, key: CanonicalHeader) {
  const index = indexes[key];
  return typeof index === "number" ? row[index]?.trim() ?? "" : "";
}

function marketLookup(markets: Market[]): MarketLookup {
  const byGeoid = new Map(markets.map((market) => [market.geoid, market]));
  const byNameState = new Map<string, Market[]>();

  for (const market of markets) {
    for (const state of market.states) {
      const key = `${normalizeGeo(market.name)}|${normalizeState(state)}`;
      const candidates = byNameState.get(key) ?? [];
      if (candidates.some((candidate) => candidate.geoid === market.geoid)) continue;
      byNameState.set(key, [...candidates, market]);
    }
  }

  return { byGeoid, byNameState };
}

function isBaseline(row: ImportedAdsRow) {
  return Boolean(row.baselineGroup?.trim()) && /baseline|control/iu.test(row.baselineGroup ?? "");
}

function resolveMarket(row: ImportedAdsRow, lookup: MarketLookup) {
  if (row.marketGeoid) {
    return lookup.byGeoid.get(row.marketGeoid) ?? null;
  }

  if (!row.geoName || !row.state) return null;
  const candidates = lookup.byNameState.get(`${normalizeGeo(row.geoName)}|${normalizeState(row.state)}`) ?? [];
  return candidates.length === 1 ? candidates[0] : null;
}

function addRow(total: MappedMarketPerformance, row: ImportedAdsRow) {
  total.clicks = addOptionalMetric(total.clicks, row.clicks);
  total.conversions = addOptionalMetric(total.conversions, row.conversions);
  total.costUsd = addOptionalMetric(total.costUsd, row.costUsd);
  total.firstTransfers += row.firstTransfers;
  total.hasFirstTransferEvidence =
    total.rowCount === 0
      ? row.hasFirstTransferEvidence
      : total.hasFirstTransferEvidence && row.hasFirstTransferEvidence;
  total.impressions = addOptionalMetric(total.impressions, row.impressions);
  total.rowCount += 1;
  total.trusted = total.hasFirstTransferEvidence && total.firstTransfers >= MIN_CONVERSIONS_FOR_TRUST;
}

function addOptionalMetric(total: number | null, value: number | null) {
  return total === null || value === null ? null : total + value;
}

export function parseAdsCsv(text: string, markets: Market[]): AdsImportResult {
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const { indexes, resolvedHeaders } = resolveHeaders(parsed[0]);
  const requiredAnyGeo = indexes.marketGeoid !== undefined || (indexes.geoName !== undefined && indexes.state !== undefined);
  const missingRecommendedHeaders = [
    requiredAnyGeo ? null : "market_geoid or geo_name plus state",
    indexes.costUsd === undefined ? "spend or cost" : null,
    indexes.firstTransfers === undefined ? "first_transfers for proof status" : null,
    indexes.platform === undefined ? "platform" : null,
    indexes.campaign === undefined ? "campaign" : null,
    indexes.baselineGroup === undefined ? "baseline_group" : null,
  ].filter((value): value is string => Boolean(value));
  const lookup = marketLookup(markets);
  const rows = parsed.slice(1).map<ImportedAdsRow>((row, index) => {
    const conversions = parseOptionalMetric(row, indexes, "conversions");
    const firstTransferCell = valueAt(row, indexes, "firstTransfers");
    const parsedFirstTransfers =
      indexes.firstTransfers === undefined ? null : parseNumericCell(firstTransferCell);
    const firstTransfers =
      indexes.firstTransfers === undefined
        ? 0
        : parsedFirstTransfers ?? 0;

    return {
      baselineGroup: valueAt(row, indexes, "baselineGroup") || null,
      campaign: valueAt(row, indexes, "campaign") || null,
      clicks: parseOptionalMetric(row, indexes, "clicks"),
      conversions,
      costUsd: parseOptionalMetric(row, indexes, "costUsd"),
      firstTransfers,
      hasFirstTransferEvidence: parsedFirstTransfers !== null,
      geoName: valueAt(row, indexes, "geoName") || null,
      impressions: parseOptionalMetric(row, indexes, "impressions"),
      isSampleData: parseSampleCell(valueAt(row, indexes, "sampleData")),
      marketGeoid: normalizeMarketGeoid(valueAt(row, indexes, "marketGeoid")) || null,
      platform: valueAt(row, indexes, "platform") || null,
      rowNumber: index + 2,
      state: valueAt(row, indexes, "state") || null,
    };
  });
  const mapped = new Map<string, MappedMarketPerformance>();
  const sampleMapped = new Map<string, MappedMarketPerformance>();
  const baselineRows: ImportedAdsRow[] = [];
  const sampleRows: ImportedAdsRow[] = [];
  const sampleUnmappedRows: UnmappedAdsRow[] = [];
  const unmappedRows: UnmappedAdsRow[] = [];

  for (const row of rows) {
    if (row.isSampleData) {
      sampleRows.push(row);
      const market = resolveMarket(row, lookup);
      if (!market) {
        sampleUnmappedRows.push({
          ...row,
          reason: row.marketGeoid
            ? "sample market_geoid was not found in the market artifact"
            : "sample geo_name plus state did not match exactly one market",
        });
        continue;
      }

      const current =
        sampleMapped.get(market.geoid) ??
        {
          clicks: 0,
          conversions: 0,
          costUsd: 0,
          firstTransfers: 0,
          hasFirstTransferEvidence: false,
          impressions: 0,
          marketGeoid: market.geoid,
          rowCount: 0,
          trusted: false,
        };
      addRow(current, row);
      sampleMapped.set(market.geoid, current);
      continue;
    }

    if (isBaseline(row)) {
      baselineRows.push(row);
      continue;
    }

    const market = resolveMarket(row, lookup);
    if (!market) {
      unmappedRows.push({
        ...row,
        reason: row.marketGeoid
          ? "market_geoid was not found in the market artifact"
          : "geo_name plus state did not match exactly one market",
      });
      continue;
    }

    const current =
      mapped.get(market.geoid) ??
      {
        clicks: 0,
        conversions: 0,
        costUsd: 0,
        firstTransfers: 0,
        hasFirstTransferEvidence: false,
        impressions: 0,
        marketGeoid: market.geoid,
        rowCount: 0,
        trusted: false,
      };
    addRow(current, row);
    mapped.set(market.geoid, current);
  }

  return {
    baselineRows,
    mappedMarkets: [...mapped.values()].sort((left, right) => left.marketGeoid.localeCompare(right.marketGeoid)),
    rows,
    sampleMappedMarkets: [...sampleMapped.values()].sort((left, right) => left.marketGeoid.localeCompare(right.marketGeoid)),
    sampleRows,
    sampleUnmappedRows,
    schema: {
      missingRecommendedHeaders,
      resolvedHeaders,
    },
    unmappedRows,
  };
}

export { MIN_CONVERSIONS_FOR_TRUST };
