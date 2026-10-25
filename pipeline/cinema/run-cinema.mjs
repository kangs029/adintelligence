import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import {
  buildCinemaArtifact,
  normalizeCinemaV1Snapshot,
} from "./normalize.mjs";

function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function runCinema({
  root = process.cwd(),
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? todayGeneratedAt(),
} = {}) {
  const rawRoot = join(root, "data", "raw", "cinema");
  const snapshot = normalizeCinemaV1Snapshot({
    blockbusterMarkets: await readJson(join(rawRoot, "cinema-blockbuster-markets.json")),
    pushpa2: await readJson(join(rawRoot, "cinema-pushpa2-theaters.json")),
    pulse: await readJson(join(rawRoot, "cinema-pulse-baselines.json")),
  });
  const artifact = buildCinemaArtifact({
    snapshot,
    generatedAt,
  });

  await writeDeterministicJson(
    join(root, "data", "artifacts", "cinema.json"),
    artifact,
  );

  return artifact;
}
