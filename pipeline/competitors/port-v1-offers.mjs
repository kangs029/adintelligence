import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

export const V1_COMPETITORS_RAW_FILE = join("data", "raw", "v1-port", "competitors.json");
export const OFFER_TRACKER_ARTIFACT_FILE = join("data", "artifacts", "competitor-offers.json");

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function offerRecordFromSignal(signal, index) {
  return {
    capturedAt: cleanText(signal.capturedAt),
    evidenceLabel: cleanText(signal.sourceLabel),
    id: `v1-offer-${String(index + 1).padStart(2, "0")}`,
    observation: cleanText(signal.signal),
    offer: cleanText(signal.detail),
    priority: cleanText(signal.priority),
    provider: cleanText(signal.competitor),
    sourceUrl: cleanText(signal.link),
  };
}

export function buildOfferTrackerArtifact({
  generatedAt = new Date().toISOString(),
  source,
} = {}) {
  const signals = Array.isArray(source?.signals) ? source.signals : [];

  return {
    meta: {
      caveats: [
        "Dated public offer evidence. Intro offers change frequently; re-verify before citing in a meeting.",
        "Offer observations are source evidence, not proof of budget, targeting, delivery, or performance.",
      ],
      family: "competitor-offers",
      generatedAt,
      method:
        "Ported from v1 grounded competitors signals. Original capturedAt dates are preserved.",
      provenance: "snapshot",
      refreshCadence: "manual v1 port",
      source: V1_COMPETITORS_RAW_FILE,
      version: 1,
    },
    data: {
      records: signals.map(offerRecordFromSignal),
    },
  };
}

export async function runV1OfferPort({
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? new Date().toISOString(),
  root = process.cwd(),
} = {}) {
  const source = readJsonIfExists(join(root, V1_COMPETITORS_RAW_FILE));
  if (!source) {
    throw new Error(`${V1_COMPETITORS_RAW_FILE} is required before porting offers.`);
  }

  const artifact = buildOfferTrackerArtifact({ generatedAt, source });
  await writeDeterministicJsonPreservingArrays(join(root, OFFER_TRACKER_ARTIFACT_FILE), artifact);
  return artifact;
}
