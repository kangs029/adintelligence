import {
  ACS_BASE_URL,
  ACS_CBSA_GEOGRAPHY,
  ACS_DATASET_PATH,
  ACS_QUERY_VARIABLES,
  TIGERWEB_ACS_2024_CBSA_LAYERS,
  TIGERWEB_CBSA_ENDPOINT,
} from "./constants.mjs";

function getContentType(response) {
  return response.headers?.get?.("content-type") ?? "";
}

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status} ${response.statusText}`.trim());
  }
}

function assertJsonResponse(response, label) {
  const contentType = getContentType(response);
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} returned a non-JSON Census response (${contentType || "unknown"})`);
  }
}

function assertNoApiError(json, label) {
  if (json?.error) {
    throw new Error(`${label} returned an error: ${json.error.message ?? "unknown error"}`);
  }
}

export function buildAcsCbsaUrl({ apiKey }) {
  const url = new URL(ACS_DATASET_PATH, ACS_BASE_URL);
  url.searchParams.set("get", ACS_QUERY_VARIABLES.join(","));
  url.searchParams.set("for", `${ACS_CBSA_GEOGRAPHY}:*`);
  url.searchParams.set("key", apiKey);
  return url;
}

export function buildAcsNationalUrl({ apiKey }) {
  const url = new URL(ACS_DATASET_PATH, ACS_BASE_URL);
  url.searchParams.set("get", ACS_QUERY_VARIABLES.join(","));
  url.searchParams.set("for", "us:*");
  url.searchParams.set("key", apiKey);
  return url;
}

export async function fetchAcsTable({
  apiKey = process.env.CENSUS_API_KEY,
  fetchImpl = fetch,
  geography = "cbsa",
} = {}) {
  if (!apiKey) {
    throw new Error("CENSUS_API_KEY is required for live Census ACS API pulls.");
  }

  const url = geography === "us" ? buildAcsNationalUrl({ apiKey }) : buildAcsCbsaUrl({ apiKey });
  const response = await fetchImpl(url);
  assertOk(response, "Census ACS API");
  assertJsonResponse(response, "Census ACS API");
  const json = await response.json();
  assertNoApiError(json, "Census ACS API");

  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error("Census ACS API returned JSON in an unexpected table shape.");
  }

  return json;
}

function whereForCbsas(cbsas) {
  if (!cbsas?.length) {
    return "1=1";
  }

  const safeIds = cbsas.map((cbsa) => String(cbsa).replace(/[^\d]/gu, "")).filter(Boolean);
  return `GEOID IN (${safeIds.map((cbsa) => `'${cbsa}'`).join(",")})`;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildTigerwebLayerUrl(layer, { returnGeometry = false, cbsas } = {}) {
  const params = new URLSearchParams({
    f: "json",
    where: whereForCbsas(cbsas),
    outFields: "GEOID,NAME,INTPTLAT,INTPTLON",
    returnGeometry: returnGeometry ? "true" : "false",
  });
  if (returnGeometry) {
    params.set("outSR", "4326");
  }
  return new URL(`${TIGERWEB_CBSA_ENDPOINT}/${layer}/query?${params}`);
}

function parseTigerwebPoint(feature) {
  const attributes = feature?.attributes ?? {};
  return {
    cbsa: String(attributes.GEOID ?? ""),
    name: String(attributes.NAME ?? ""),
    lat: Number.parseFloat(String(attributes.INTPTLAT ?? "")),
    lng: Number.parseFloat(String(attributes.INTPTLON ?? "")),
  };
}

export async function fetchTigerwebCbsaPoints({ fetchImpl = fetch } = {}) {
  const pointGroups = await Promise.all(
    TIGERWEB_ACS_2024_CBSA_LAYERS.map(async (layer) => {
      const response = await fetchImpl(buildTigerwebLayerUrl(layer));
      assertOk(response, "Census TIGERweb API");
      assertJsonResponse(response, "Census TIGERweb API");
      const json = await response.json();
      assertNoApiError(json, "Census TIGERweb API");
      if (!Array.isArray(json.features)) {
        throw new Error("Census TIGERweb API returned JSON without a features array.");
      }
      return json.features.map(parseTigerwebPoint);
    }),
  );

  return pointGroups.flat().filter((point) => point.cbsa && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function boundsFromRings(rings) {
  const points = rings.flat().filter((point) => Array.isArray(point) && point.length >= 2);
  const lngs = points.map((point) => Number(point[0])).filter(Number.isFinite);
  const lats = points.map((point) => Number(point[1])).filter(Number.isFinite);

  if (!lngs.length || !lats.length) {
    return undefined;
  }

  return {
    south: Math.min(...lats),
    west: Math.min(...lngs),
    north: Math.max(...lats),
    east: Math.max(...lngs),
  };
}

function parseTigerwebGeometry(feature) {
  const point = parseTigerwebPoint(feature);
  const bbox = boundsFromRings(feature?.geometry?.rings ?? []);
  return {
    ...point,
    ...(bbox ? { bbox } : {}),
  };
}

export async function fetchTigerwebCbsaGeometries({ fetchImpl = fetch, cbsas = [] } = {}) {
  const cbsaChunks = chunk(cbsas, 25);
  const layerRequests = TIGERWEB_ACS_2024_CBSA_LAYERS.flatMap((layer) =>
    (cbsaChunks.length ? cbsaChunks : [undefined]).map(async (cbsaChunk) => {
      const response = await fetchImpl(buildTigerwebLayerUrl(layer, {
        returnGeometry: true,
        cbsas: cbsaChunk,
      }));
      assertOk(response, "Census TIGERweb API");
      assertJsonResponse(response, "Census TIGERweb API");
      const json = await response.json();
      assertNoApiError(json, "Census TIGERweb API");
      if (!Array.isArray(json.features)) {
        throw new Error("Census TIGERweb API returned JSON without a features array.");
      }
      return json.features.map(parseTigerwebGeometry);
    }),
  );
  const geometryGroups = await Promise.all(layerRequests);

  return geometryGroups
    .flat()
    .filter((geometry) => geometry.cbsa && geometry.bbox);
}
