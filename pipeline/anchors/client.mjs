const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DHARMIC_NAME_QUERY =
  "Mandir|Hindu|Swaminarayan|Venkateswara|Balaji|Tirupati|ISKCON|Jain|Gurdwara|Gurudwara|Murugan|Meenakshi|Ayyappa|BAPS|Hanuman|Ganesh|Sai|Saibaba|Shirdi|Lakshmi|Veda|Krishna|Durga|Sikh|Singh Sabha";
const SOUTH_ASIAN_GROCERY_NAME_QUERIES = [
  "India|Indian|Desi|Apna|Patel|Bharat|Bombay|Mumbai",
  "Masala|Namaste|Swad|Sabzi|Subzi|Mirch|Zaika|Spicewalla",
  "Saravana|Annapurna|Cardamom|Tulsi|Sangam|Madras|Chennai|Sangeetha",
  "Punjab|Punjabi|Gujarat|Gujarati|Telugu|Tamil|Kerala|Lakshmi|Patidar",
];
const SOUTH_ASIAN_GROCERY_NAME_QUERY = SOUTH_ASIAN_GROCERY_NAME_QUERIES.join("|");

function bboxString({ south, west, north, east }) {
  return `${south},${west},${north},${east}`;
}

function selector(
  kind,
  bbox,
  { elementTypes = ["node", "way"], includeRelations = true } = {},
) {
  const selectors = elementTypes.map((elementType) => `${elementType}${kind}(${bbox});`);
  if (includeRelations) {
    selectors.push(`relation${kind}(${bbox});`);
  }
  return selectors.join("\n");
}

export function buildOverpassQuery({ bbox, timeout = 60 }) {
  const bounds = bboxString(bbox);
  return [
    `[out:json][timeout:${timeout}];`,
    "(",
    selector('["amenity"="place_of_worship"]["religion"~"^(hindu|jain|sikh)$"]', bounds),
    selector(`["amenity"="place_of_worship"]["name"~"${DHARMIC_NAME_QUERY}",i]`, bounds),
    selector(`["shop"~"^(supermarket|convenience|grocery)$"]["name"~"${SOUTH_ASIAN_GROCERY_NAME_QUERY}",i]`, bounds),
    selector('["leisure"="pitch"]["sport"="cricket"]', bounds),
    selector('["sport"="cricket"]', bounds),
    ");",
    "out center tags;",
  ].join("\n");
}

function buildQueryFromSelectors({
  bbox,
  elementTypes,
  includeRelations = false,
  selectors,
  timeout = 60,
}) {
  const bounds = bboxString(bbox);
  return [
    `[out:json][timeout:${timeout}];`,
    "(",
    ...selectors.map((querySelector) =>
      selector(querySelector, bounds, { elementTypes, includeRelations }),
    ),
    ");",
    "out center tags;",
  ].join("\n");
}

export function buildOverpassQueries({ bbox, timeout = 60 }) {
  return [
    buildQueryFromSelectors({
      bbox,
      timeout,
      selectors: ['["amenity"="place_of_worship"]["religion"~"^(hindu|jain|sikh)$"]'],
    }),
    buildQueryFromSelectors({
      bbox,
      timeout,
      selectors: [
        `["amenity"="place_of_worship"]["name"~"${DHARMIC_NAME_QUERY}",i]`,
      ],
    }),
    ...SOUTH_ASIAN_GROCERY_NAME_QUERIES.flatMap((groceryQuery) => [
      buildQueryFromSelectors({
        bbox,
        elementTypes: ["node"],
        timeout,
        selectors: [
          `["shop"~"^(supermarket|convenience|grocery)$"]["name"~"${groceryQuery}",i]`,
        ],
      }),
      buildQueryFromSelectors({
        bbox,
        elementTypes: ["way"],
        includeRelations: true,
        timeout,
        selectors: [
          `["shop"~"^(supermarket|convenience|grocery)$"]["name"~"${groceryQuery}",i]`,
        ],
      }),
    ]),
    buildQueryFromSelectors({
      bbox,
      timeout,
      selectors: ['["leisure"="pitch"]["sport"="cricket"]', '["sport"="cricket"]'],
    }),
  ];
}

export function buildOverpassUrl(query) {
  const url = new URL(OVERPASS_ENDPOINT);
  url.searchParams.set("data", query);
  return url;
}

function contentType(response) {
  return response.headers?.get?.("content-type") ?? "";
}

function retryAfterMs(response, fallbackMs) {
  const retryAfter = Number.parseFloat(response.headers?.get?.("retry-after") ?? "");
  return Number.isFinite(retryAfter) ? retryAfter * 1000 : fallbackMs;
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isRetryableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchOverpassOnce({ query, fetchImpl }) {
  return fetchImpl(buildOverpassUrl(query), {
    headers: {
      accept: "application/json",
      "user-agent": "xpat-os-build/0.1",
    },
  });
}

export async function fetchOverpassElements({
  query,
  fetchImpl = fetch,
  maxRetries = 3,
  retryDelayMs = 10_000,
} = {}) {
  let response;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    response = await fetchOverpassOnce({ query, fetchImpl });
    if (response.ok || !isRetryableStatus(response.status) || attempt === maxRetries) {
      break;
    }
    await wait(retryAfterMs(response, retryDelayMs * (attempt + 1)));
  }

  if (!response.ok) {
    throw new Error(`Overpass API failed with ${response.status} ${response.statusText}`.trim());
  }

  if (!contentType(response).toLowerCase().includes("application/json")) {
    throw new Error(`Overpass API returned a non-JSON Overpass response (${contentType(response)})`);
  }

  const json = await response.json();
  if (!Array.isArray(json.elements)) {
    throw new Error("Overpass API returned JSON without an elements array.");
  }

  return {
    capturedAt: json.osm3s?.timestamp_osm_base,
    elements: json.elements,
  };
}

function elementKey(element) {
  return `${element.type}/${element.id}`;
}

function latestTimestamp(timestamps) {
  return timestamps.filter(Boolean).sort().at(-1);
}

export async function fetchOverpassAnchorElements({
  queries,
  query,
  fetchImpl = fetch,
  queryDelayMs = 750,
} = {}) {
  const queryList = queries?.length ? queries : [query];
  const elementsByKey = new Map();
  const capturedAts = [];

  for (const [index, nextQuery] of queryList.entries()) {
    const result = await fetchOverpassElements({ query: nextQuery, fetchImpl });
    capturedAts.push(result.capturedAt);
    for (const element of result.elements) {
      elementsByKey.set(elementKey(element), element);
    }
    if (index < queryList.length - 1) {
      await wait(queryDelayMs);
    }
  }

  return {
    capturedAt: latestTimestamp(capturedAts),
    elements: [...elementsByKey.values()].sort((left, right) =>
      elementKey(left).localeCompare(elementKey(right)),
    ),
  };
}
