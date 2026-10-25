import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { fetchTigerwebCbsaGeometries } from "../census/client.mjs";
import { writeDeterministicJson } from "../lib/provenance.mjs";
import { buildAnchorsArtifact } from "./build-anchors.mjs";
import {
  buildOverpassQueries,
  buildOverpassQuery,
  fetchOverpassAnchorElements,
} from "./client.mjs";
import { normalizeOverpassElements } from "./normalize.mjs";
import { mergeAnchorRollupsIntoMarkets, rollupAnchorsByMarket } from "./rollups.mjs";

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

function cbsaFromGeoid(geoid) {
  return String(geoid).replace(/^31000US/u, "");
}

async function loadMarketsArtifact(root) {
  return JSON.parse(await readFile(join(root, "data", "artifacts", "markets.json"), "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

const LIVE_SWEEP_QUERY_VERSION = 6;

function emptyLiveSweepCache() {
  return { markets: {}, queryVersion: LIVE_SWEEP_QUERY_VERSION };
}

async function loadLiveSweepCache(cachePath) {
  const cache = await readJsonIfExists(cachePath);
  if (!cache || cache.queryVersion !== LIVE_SWEEP_QUERY_VERSION) {
    return emptyLiveSweepCache();
  }
  return cache;
}

async function writeLiveSweepCache(cachePath, cache) {
  await writeDeterministicJson(cachePath, cache);
}

function geometryMapByCbsa(geometries) {
  return new Map(geometries.map((geometry) => [geometry.cbsa, geometry]));
}

function latestTimestamp(timestamps, fallback) {
  const valid = timestamps.filter(Boolean).sort();
  return valid.at(-1) ?? fallback;
}

function sortAnchors(anchors) {
  return anchors.toSorted((left, right) => {
    const marketOrder = left.marketGeoid.localeCompare(right.marketGeoid);
    return marketOrder || left.id.localeCompare(right.id);
  });
}

async function defaultFetchElements({ query, queries }) {
  return fetchOverpassAnchorElements({ query, queries, queryDelayMs: 300 });
}

function selectMarkets(markets, marketLimit) {
  const sweepableMarkets = markets.filter((market) => market.tier === 1 || market.tier === 2);
  if (Number.isInteger(marketLimit) && marketLimit > 0) {
    return sweepableMarkets.slice(0, marketLimit);
  }
  return sweepableMarkets;
}

function configuredMarketLimit() {
  const parsed = Number.parseInt(process.env.XPAT_ANCHOR_MARKET_LIMIT ?? "", 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function configuredDelayMs() {
  const parsed = Number.parseInt(process.env.XPAT_ANCHOR_DELAY_MS ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 3_000;
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function emptyRollup() {
  return {
    temples: 0,
    groceries: 0,
    cricket: 0,
    theaters: 0,
    per10kAI: 0,
  };
}

function rollupTotal(rollup = emptyRollup()) {
  return rollup.temples + rollup.groceries + rollup.cricket + rollup.theaters;
}

function sweptMarketRollups({ anchors, markets }) {
  const fetchedRollups = rollupAnchorsByMarket({ anchors, markets });
  return Object.fromEntries(
    markets.map((market) => [market.geoid, fetchedRollups[market.geoid] ?? emptyRollup()]),
  );
}

export async function runAnchors({
  root = process.cwd(),
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
  fetchGeometries = fetchTigerwebCbsaGeometries,
  fetchElements = defaultFetchElements,
  delayMs = configuredDelayMs(),
  marketLimit = configuredMarketLimit(),
} = {}) {
  const marketsArtifact = await loadMarketsArtifact(root);
  const existingAnchorsArtifact = await readJsonIfExists(
    join(root, "data", "artifacts", "anchors.json"),
  );
  const liveSweepCachePath = join(root, "data", "raw", "anchors", "live-sweep-cache.json");
  const liveSweepCache = await loadLiveSweepCache(liveSweepCachePath);
  const markets = selectMarkets(marketsArtifact.data.markets, marketLimit);
  const sweptMarketGeoids = markets.map((market) => market.geoid).sort();
  const sweptMarketSet = new Set(sweptMarketGeoids);
  const cbsas = markets.map((market) => cbsaFromGeoid(market.geoid));
  const geometries = geometryMapByCbsa(await fetchGeometries({ cbsas }));
  const fetchedAnchors = [];
  const capturedAts = [];
  const missingBounds = [];

  for (const [index, market] of markets.entries()) {
    const geometry = geometries.get(cbsaFromGeoid(market.geoid));
    if (!geometry?.bbox) {
      missingBounds.push(market.geoid);
      continue;
    }

    const query = buildOverpassQuery({ bbox: geometry.bbox });
    const queries = buildOverpassQueries({ bbox: geometry.bbox, timeout: 30 });
    const cachedResult = liveSweepCache.markets[market.geoid];
    const result =
      cachedResult ??
      (await fetchElements({
        market,
        bbox: geometry.bbox,
        query,
        queries,
      }));

    if (!cachedResult) {
      liveSweepCache.markets[market.geoid] = result;
      await writeLiveSweepCache(liveSweepCachePath, liveSweepCache);
    }

    console.log(
      `[anchors-live] ${index + 1}/${markets.length} ${market.geoid} ${market.name} ${
        cachedResult ? "cache" : "fetched"
      } ${result.elements.length} raw elements`,
    );
    capturedAts.push(result.capturedAt);
    fetchedAnchors.push(
      ...normalizeOverpassElements({
        marketGeoid: market.geoid,
        elements: result.elements,
      }),
    );

    if (index < markets.length - 1) {
      await wait(delayMs);
    }
  }

  if (missingBounds.length) {
    throw new Error(`Missing Census TIGERweb bounds for ${missingBounds.length} markets.`);
  }

  const previousAnchors = existingAnchorsArtifact?.data?.anchors ?? [];
  const retainedAnchors = previousAnchors.filter((anchor) => !sweptMarketSet.has(anchor.marketGeoid));
  const marketRollups = {
    ...(existingAnchorsArtifact?.data?.marketRollups ?? {}),
    ...sweptMarketRollups({ anchors: fetchedAnchors, markets }),
  };
  const anchorArtifact = buildAnchorsArtifact({
    anchors: sortAnchors([...retainedAnchors, ...fetchedAnchors]),
    capturedAt: latestTimestamp(capturedAts, generatedAt),
    generatedAt,
    marketRollups,
    sweptMarkets: sweptMarketGeoids,
  });
  anchorArtifact.meta.method = `${anchorArtifact.meta.method} Census TIGERweb CBSA bounding boxes define sweep extents.`;
  anchorArtifact.meta.caveats.push(
    "Bounding-box sweeps can include nearby anchors outside the exact CBSA polygon and should be treated as review inventory.",
    "Tier 1 and Tier 2 markets were refreshed from live Overpass sweeps; other market rollups retain audited v1 pocket counts.",
  );
  for (const market of markets) {
    const previousRollup = existingAnchorsArtifact?.data?.marketRollups?.[market.geoid];
    const nextRollup = marketRollups[market.geoid];
    if (previousRollup && rollupTotal(nextRollup) < rollupTotal(previousRollup)) {
      anchorArtifact.meta.caveats.push(
        `Live Overpass sweep for ${market.name} returned ${rollupTotal(
          nextRollup,
        )} anchors versus ${rollupTotal(previousRollup)} audited v1 anchors; fetched truth wins.`,
      );
    }
  }

  const mergedMarkets = mergeAnchorRollupsIntoMarkets({
    marketsArtifact,
    anchors: anchorArtifact.data.anchors,
    marketRollups,
  });

  await writeDeterministicJson(
    join(root, "data", "artifacts", "anchors.json"),
    anchorArtifact,
  );
  await writeDeterministicJson(
    join(root, "data", "artifacts", "markets.json"),
    mergedMarkets,
  );

  return {
    anchors: anchorArtifact,
    markets: mergedMarkets,
  };
}
