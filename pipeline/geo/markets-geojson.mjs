import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function anchorCount(market) {
  return (
    (market.anchorSummary?.temples ?? 0) +
    (market.anchorSummary?.groceries ?? 0) +
    (market.anchorSummary?.cricket ?? 0) +
    (market.anchorSummary?.theaters ?? 0)
  );
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function markerRadius(asianIndianPopulation) {
  return round(Math.max(4, Math.sqrt(asianIndianPopulation) / 32));
}

function marketProperties(market) {
  return {
    geoid: market.geoid,
    name: market.name,
    state: market.state,
    states: market.states,
    tier: market.tier,
    score: market.score,
    markerRadius: markerRadius(market.population.asianIndian),
    asianIndian: market.population.asianIndian,
    asianIndianMoe: market.population.moe,
    localSharePct: market.concentration.localSharePct,
    multipleOfUS: market.concentration.multipleOfUS,
    moeReliability: market.moeReliability,
    anchorCount: anchorCount(market),
    templeCount: market.anchorSummary?.temples ?? 0,
    groceryCount: market.anchorSummary?.groceries ?? 0,
    cricketCount: market.anchorSummary?.cricket ?? 0,
    theaterCount: market.anchorSummary?.theaters ?? 0,
    anchorsPer10kAI: market.anchorSummary?.per10kAI ?? 0,
    lcaFilings: market.employmentProxy?.lcaFilings ?? 0,
    activeIndianStudents: market.students?.activeIndianStudents ?? 0,
  };
}

export function buildMarketFeatureCollection(marketsArtifact) {
  return {
    type: "FeatureCollection",
    features: marketsArtifact.data.markets.map((market) => ({
      type: "Feature",
      id: market.geoid,
      geometry: {
        type: "Point",
        coordinates: [market.lng, market.lat],
      },
      properties: marketProperties(market),
    })),
  };
}

export async function runMarketsGeoJson({ root = process.cwd() } = {}) {
  const marketsArtifact = await readJson(join(root, "data", "artifacts", "markets.json"));
  const collection = buildMarketFeatureCollection(marketsArtifact);
  await writeDeterministicJson(
    join(root, "data", "artifacts", "markets-geojson.json"),
    collection,
  );
  return collection;
}
