import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { runGoogleAds } from "./ads-google.mjs";
import { runMetaAds } from "./ads-meta.mjs";
import { buildV1AdCaptureRecords } from "./port-v1-ad-captures.mjs";

const CURATION_FILE = join("data", "curation", "competitor-ads.json");
const ARTIFACT_FILE = join("data", "artifacts", "competitor-ads.json");

function daysSince(value, now) {
  return (new Date(now).getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function captureWindow(generatedAt) {
  const to = new Date(generatedAt);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function buildAdsArtifact({
  curationFile = CURATION_FILE,
  generatedAt = new Date().toISOString(),
  records,
}) {
  return {
    meta: {
      caveats: [
        "Public creative proves visible footprint. It does not prove spend, targeting, delivery, or performance.",
        "Search pages can return no parseable ad cards even when an advertiser has other public pages.",
        "Screenshot rows keep a raw capture path and a public evidence copy for UI display.",
        "June 17, 2026 rows are ported from v1 with original capture dates; some v1 publicAdExamples kept source metadata without a PNG capture.",
      ],
      family: "competitor-ads",
      generatedAt,
      method:
        "Weekly-max Playwright sweep of Meta Ad Library and Google Ads Transparency Center public pages, plus a v1 June 17, 2026 evidence port. Each parseable fresh ad card is screenshot into data/raw/ads and copied to public/evidence/ads for UI display.",
      provenance: "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "Meta Ad Library public UI, Google Ads Transparency Center public UI",
      version: 1,
    },
    data: {
      curation: {
        publicEvidenceDir: "public/evidence/ads",
        selectedCount: records.filter((record) => record.screenshotPath).length,
        sourceFile: curationFile,
      },
      records,
      window: captureWindow(generatedAt),
    },
  };
}

async function applyCuration({ curation, records, root }) {
  const selected = Array.isArray(curation?.selected) ? curation.selected : [];
  const byId = new Map(records.map((record) => [record.id, { ...record }]));

  for (const item of selected) {
    const record = byId.get(item.id);
    if (!record || !item.publicPath || !item.sourceRawPath) {
      continue;
    }

    const publicPath = item.publicPath.startsWith("/") ? item.publicPath : `/${item.publicPath}`;
    const outputPath = join(root, "public", publicPath.replace(/^\/+/u, ""));
    await mkdir(dirname(outputPath), { recursive: true });
    await copyFile(join(root, item.sourceRawPath), outputPath);
    record.screenshotPath = publicPath;
    byId.set(record.id, record);
  }

  return [...byId.values()];
}

export async function runAds({
  delayMs = 1_500,
  force = process.env.FORCE_AD_SWEEP === "1",
  generatedAt = new Date().toISOString(),
  root = process.cwd(),
} = {}) {
  const artifactPath = join(root, ARTIFACT_FILE);
  const existing = readJsonIfExists(artifactPath);

  if (!force && existing?.meta?.generatedAt && daysSince(existing.meta.generatedAt, generatedAt) < 7) {
    return existing;
  }

  const capturedAt = generatedAt;
  const metaRecords = await runMetaAds({ capturedAt, delayMs, root });
  const googleRecords = await runGoogleAds({ capturedAt, delayMs, root });
  const v1Records = buildV1AdCaptureRecords({ root });
  const curation = readJsonIfExists(join(root, CURATION_FILE)) ?? { selected: [] };
  const records = await applyCuration({
    curation,
    records: [...v1Records, ...metaRecords, ...googleRecords],
    root,
  });
  const artifact = buildAdsArtifact({ curationFile: CURATION_FILE, generatedAt, records });

  await writeDeterministicJson(artifactPath, artifact);
  return artifact;
}
