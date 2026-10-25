import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { buildAnchorsArtifact } from "./build-anchors.mjs";
import { fetchOverpassElements } from "./client.mjs";
import { mergeAnchorRollupsIntoMarkets } from "./rollups.mjs";
import {
  anchorsFromPocketSamples,
  buildOverpassIdQuery,
  buildPocketMarketRollups,
  chunkRefs,
  collectPocketSamples,
} from "./pocket-snapshot.mjs";

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function defaultFetchElements(query) {
  return fetchOverpassElements({ query });
}

function capturedAtFromPockets(pocketsArtifact) {
  const asOf = pocketsArtifact.osm?.asOf ?? pocketsArtifact.asOf;
  return asOf ? `${asOf}T00:00:00.000Z` : undefined;
}

async function writeRawCache(filePath, payload) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function combineFetchResults(results) {
  return {
    capturedAt: results.map((result) => result.capturedAt).filter(Boolean).sort().at(-1),
    elements: results.flatMap((result) => result.elements ?? []),
  };
}

async function fetchRefChunks({ refs, fetchElements, delayMs = 500 }) {
  const results = [];
  const chunks = chunkRefs(refs);

  for (const [index, refChunk] of chunks.entries()) {
    results.push(await fetchElements(buildOverpassIdQuery(refChunk)));
    if (index < chunks.length - 1) {
      await wait(delayMs);
    }
  }

  return combineFetchResults(results);
}

export async function runAnchorSnapshot({
  root = process.cwd(),
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
  fetchElements = defaultFetchElements,
} = {}) {
  const marketsPath = join(root, "data", "artifacts", "markets.json");
  const pocketsPath = join(root, "data", "raw", "anchors", "pockets.json");
  const cachePath = join(root, "data", "raw", "anchors", "osm-sample-elements.json");
  const marketsArtifact = await readJson(marketsPath);
  const pocketsArtifact = await readJson(pocketsPath);
  const pockets = pocketsArtifact.pockets ?? [];
  const samples = collectPocketSamples(pockets);
  const refs = samples.map((sample) => sample.ref);
  const cached = await readJsonIfExists(cachePath);
  const fetched = cached ?? await fetchRefChunks({ refs, fetchElements });

  if (!cached) {
    await writeRawCache(cachePath, fetched);
  }

  const marketRollups = buildPocketMarketRollups({
    pockets,
    markets: marketsArtifact.data.markets,
  });
  const anchors = anchorsFromPocketSamples({
    samples,
    elements: fetched.elements ?? [],
  });
  const artifact = buildAnchorsArtifact({
    anchors,
    capturedAt: capturedAtFromPockets(pocketsArtifact) ?? fetched.capturedAt ?? generatedAt,
    generatedAt,
    marketRollups,
  });
  artifact.meta.source = "OpenStreetMap Overpass API via v1 audited pocket snapshot";
  artifact.meta.method = [
    "Ported v1 audited Overpass pocket counts for CBSA markets.",
    "Hydrated linked OSM sample objects by stable node, way, and relation ids.",
    `${anchors.length} sample anchors included; ${Object.keys(marketRollups).length} markets carry audited rollups.`,
  ].join(" ");
  artifact.meta.caveats.push(
    "Rollups cover the v1 audited pocket market set, not every Census CBSA.",
    "Sample anchors are evidence examples; market rollups preserve the audited v1 Overpass counts.",
  );

  const mergedMarkets = mergeAnchorRollupsIntoMarkets({
    marketsArtifact,
    anchors,
    marketRollups,
  });

  await writeDeterministicJson(join(root, "data", "artifacts", "anchors.json"), artifact);
  await writeDeterministicJson(marketsPath, mergedMarkets);

  return {
    anchors: artifact,
    markets: mergedMarkets,
  };
}
