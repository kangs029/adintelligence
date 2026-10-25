import { ACS_CBSA_GEOGRAPHY, ACS_VARIABLES } from "./constants.mjs";

const SENTINEL_VALUES = new Set(["", "-666666666", "-222222222", "null", "undefined"]);

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseNumber(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (SENTINEL_VALUES.has(normalized)) {
    return undefined;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function tableToRecords(rows) {
  const [headers, ...body] = rows;
  return body.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

export function parseMarketName(rawName) {
  const withoutSuffix = rawName.replace(/\s+(Metro|Micro) Area$/u, "");
  const [namePart, statePart = ""] = withoutSuffix.split(/,\s+/u);
  const states = statePart.split("-").filter(Boolean);

  return {
    name: namePart,
    state: states[0] ?? "",
    states,
  };
}

export function reliabilityBucket(estimate, moe) {
  if (!moe || moe <= 0) {
    return "high";
  }

  const ratio = estimate / moe;
  if (ratio >= 3) {
    return "high";
  }
  if (ratio >= 1) {
    return "medium";
  }
  return "low";
}

export function qualityReasonForRow({ asianIndian, moeReliability, hasPoint }) {
  if (asianIndian < 500) {
    return "asian-indian-estimate-below-500";
  }
  if (moeReliability === "low" && asianIndian < 2000) {
    return "low-reliability-under-2000";
  }
  if (!hasPoint) {
    return "missing-census-point";
  }
  return undefined;
}

function requireNumber(value, label) {
  if (value === undefined) {
    throw new Error(`Missing required Census value: ${label}`);
  }
  return value;
}

function normalizeNationalRows(nationalRows) {
  const [national] = tableToRecords(nationalRows);
  if (!national) {
    throw new Error("Census national rows are required to compute concentration.");
  }

  return {
    nationalAsianIndian: requireNumber(
      parseNumber(national[ACS_VARIABLES.asianIndian]),
      ACS_VARIABLES.asianIndian,
    ),
    nationalPopulation: requireNumber(
      parseNumber(national[ACS_VARIABLES.totalPopulation]),
      ACS_VARIABLES.totalPopulation,
    ),
  };
}

function buildPointMap(points) {
  return new Map(points.map((point) => [point.cbsa, point]));
}

function normalizeMarketRecord(record, national, pointMap) {
  const cbsa = String(record[ACS_CBSA_GEOGRAPHY] ?? "");
  const rawName = String(record.NAME ?? "");
  const asianIndian = requireNumber(
    parseNumber(record[ACS_VARIABLES.asianIndian]),
    ACS_VARIABLES.asianIndian,
  );
  const moe = parseNumber(record[ACS_VARIABLES.asianIndianMoe]) ?? 0;
  const total = requireNumber(
    parseNumber(record[ACS_VARIABLES.totalPopulation]),
    ACS_VARIABLES.totalPopulation,
  );
  const medianHousehold = parseNumber(record[ACS_VARIABLES.medianHouseholdIncome]);
  const medianHouseholdMoe = parseNumber(record[ACS_VARIABLES.medianHouseholdIncomeMoe]);
  const point = pointMap.get(cbsa);
  const moeReliability = reliabilityBucket(asianIndian, moe);
  const holdOutReason = qualityReasonForRow({
    asianIndian,
    moeReliability,
    hasPoint: Boolean(point),
  });
  const geoid = `31000US${cbsa}`;

  if (holdOutReason) {
    return {
      kind: "held-out",
      row: {
        cbsa,
        geoid,
        name: rawName,
        asianIndian,
        moe,
        moeReliability,
        reason: holdOutReason,
      },
    };
  }

  const { name, state, states } = parseMarketName(rawName);
  const localSharePct = (asianIndian / total) * 100;
  const usSharePct = (asianIndian / national.nationalAsianIndian) * 100;
  const nationalSharePct = (national.nationalAsianIndian / national.nationalPopulation) * 100;
  const income =
    medianHousehold !== undefined && medianHouseholdMoe !== undefined
      ? { medianHousehold, moe: medianHouseholdMoe }
      : undefined;

  return {
    kind: "market",
    row: {
      geoid,
      name,
      state,
      states,
      lat: point.lat,
      lng: point.lng,
      population: {
        asianIndian,
        moe,
        total,
      },
      concentration: {
        localSharePct: round(localSharePct),
        usSharePct: round(usSharePct),
        multipleOfUS: round(localSharePct / nationalSharePct),
      },
      ...(income ? { income } : {}),
      moeReliability,
    },
  };
}

export function normalizeMarkets({ nationalRows, cbsaRows, points }) {
  const national = normalizeNationalRows(nationalRows);
  const pointMap = buildPointMap(points);
  const records = tableToRecords(cbsaRows);
  const normalized = records.map((record) => normalizeMarketRecord(record, national, pointMap));
  const markets = normalized
    .filter((entry) => entry.kind === "market")
    .map((entry) => entry.row)
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
  const heldOut = normalized
    .filter((entry) => entry.kind === "held-out")
    .map((entry) => entry.row)
    .sort((left, right) => left.geoid.localeCompare(right.geoid));

  return {
    markets,
    audit: {
      summary: {
        inputRows: records.length,
        includedRows: markets.length,
        heldOutRows: heldOut.length,
        ...national,
      },
      heldOut,
    },
  };
}
