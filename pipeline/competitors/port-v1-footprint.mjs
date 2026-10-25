import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";

const RAW_FILE = join("data", "raw", "v1-port", "competitor-observations.json");
const ARTIFACT_FILE = join("data", "artifacts", "xpat-footprint.json");
const FOOTPRINT_IDS = new Set(["obs_007", "obs_008"]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isoDate(value) {
  return `${value}T00:00:00.000Z`;
}

function normalizeObservation(observation) {
  return {
    accessMethod: observation.accessMethod,
    capturedAt: isoDate(observation.capturedAt),
    confidence: observation.confidence,
    id: observation.id,
    recommendedUse: visibilityOnlyUse(observation),
    sourcePlatform: observation.sourcePlatform,
    sourceUrl: observation.sourceUrl,
    summary: observation.summary,
    title: observation.title,
  };
}

function visibilityOnlyUse(observation) {
  if (observation.id === "obs_007") {
    return "Use as the first owned visibility benchmark across Search, YouTube, and Play placements.";
  }

  return observation.recommendedUse;
}

export function buildXpatFootprintArtifact({ raw, generatedAt } = {}) {
  const source = raw ?? readJson(RAW_FILE);
  const observations = source.observations
    .filter((observation) => FOOTPRINT_IDS.has(observation.id))
    .map(normalizeObservation);
  const latestCapturedAt = observations.map((observation) => observation.capturedAt).sort().at(-1);

  return {
    meta: {
      caveats: [
        "Public footprint visibility does not prove targeting, delivery, or customer outcomes.",
        "Placement counts overlap and should not be summed.",
      ],
      family: "xpat-footprint",
      generatedAt: generatedAt ?? latestCapturedAt,
      method:
        "Port v1 observations obs_007 and obs_008 from data/raw/v1-port/competitor-observations.json with original capture dates.",
      provenance: "snapshot",
      refreshCadence: "weekly manual ad library review",
      source: "v1 data/grounded/competitor-observations.json observations",
      version: 1,
    },
    data: {
      observations,
      status: "ok",
      summary:
        "Xpat has visible public ad-library presence, including Telugu community event sponsorships. Use this as a dated footprint benchmark only.",
    },
  };
}

export async function runXpatFootprintPort({ root = process.cwd() } = {}) {
  const artifact = buildXpatFootprintArtifact({
    raw: readJson(join(root, RAW_FILE)),
  });
  await writeDeterministicJson(join(root, ARTIFACT_FILE), artifact);
  return artifact;
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  await runXpatFootprintPort();
}
