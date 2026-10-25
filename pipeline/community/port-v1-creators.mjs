import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";

const RAW_FILE = join("data", "raw", "v1-port", "competitors.json");
const ARTIFACT_FILE = join("data", "artifacts", "creators.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function isoDate(value) {
  return `${value}T00:00:00.000Z`;
}

function latestCaptureDate(creators) {
  return creators.map((creator) => creator.capturedAt).sort().at(-1);
}

export function isEvidenceLinkedCreator(creator) {
  return (
    Boolean(creator.link) &&
    creator.capturedAt !== "2026-04-20" &&
    !/needs proof/iu.test(creator.recencyLabel ?? "") &&
    !/no current direct proof link/iu.test(creator.evidence ?? "")
  );
}

export function normalizeV1Creator(creator) {
  const evidenceLinked = isEvidenceLinkedCreator(creator);

  return {
    audienceLang: creator.audienceLang ?? "Needs verification",
    capturedAt: isoDate(creator.capturedAt),
    currentSponsor: creator.currentSponsor ?? null,
    evidence: creator.evidence,
    fitNote: `Audience-fit score ${creator.fitScore}/100 from v1 curated review.`,
    fitScore: creator.fitScore,
    followerTier: creator.followerTier ?? "Not listed",
    group: evidenceLinked ? "evidence-linked" : "leads-to-verify",
    handle: creator.handle,
    id: `v1-creator-${String(creator.rank).padStart(2, "0")}-${slug(creator.handle)}`,
    link: creator.link,
    platform: creator.platform,
    rank: creator.rank,
    recencyLabel: creator.recencyLabel,
  };
}

export function buildV1CreatorsArtifact({ raw, generatedAt } = {}) {
  const source = raw ?? readJson(RAW_FILE);
  const creators = source.creators.map(normalizeV1Creator);
  const evidenceLinkedCount = creators.filter((creator) => creator.group === "evidence-linked").length;
  const leadsToVerifyCount = creators.length - evidenceLinkedCount;
  const latestCapturedAt = latestCaptureDate(source.creators);

  return {
    meta: {
      caveats: [
        "Creator rows are ported from v1 curated evidence with original capture dates preserved.",
        "Observed sponsor means public sponsorship or link context was visible, not campaign results.",
        "YouTube API access can make this roster live-refreshable; these rows remain dated snapshots.",
      ],
      family: "creators",
      generatedAt: generatedAt ?? isoDate(latestCapturedAt),
      method:
        "Port v1 creators from data/raw/v1-port/competitors.json, preserving capturedAt, link, sponsor, audience language, fit score, and evidence text.",
      provenance: "snapshot",
      refreshCadence: "weekly when YouTube API access is configured",
      source: "v1 data/grounded/competitors.json creators",
      version: 2,
    },
    data: {
      connectorNote: {
        label: "YouTube API access makes this live-refreshable",
        status: "connector-needed",
      },
      creators,
      evidenceLinkedCount,
      leadsToVerifyCount,
      status: "ok",
      sweepErrors: [],
    },
  };
}

export async function runV1CreatorsPort({ root = process.cwd() } = {}) {
  const artifact = buildV1CreatorsArtifact({
    raw: readJson(join(root, RAW_FILE)),
  });
  await writeDeterministicJson(join(root, ARTIFACT_FILE), artifact);
  return artifact;
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  await runV1CreatorsPort();
}
