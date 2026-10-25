import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { sanitizeAdDisplayText } from "./ads-shared.mjs";

const V1_OBSERVATIONS_FILE = join("data", "raw", "v1-port", "competitor-observations.json");
const JUNE_EVIDENCE_DIR = join("public", "evidence", "ads", "june-2026");
const JUNE_CAPTURE_DATE = "2026-06-17";

const CATEGORY_CONTEXT = new Set(["Abound", "Aspora", "Instarem", "MoneyGram"]);
const TRACKED_COMPETITORS = new Set(["Remitly", "Wise", "Xoom", "Western Union", "Xpat"]);

const FILENAME_FALLBACKS = {
  "remitly-google-cr16795721931746705409.png": {
    advertiser: "Remitly, Inc.",
    brand: "Remitly",
    competitor: "Remitly",
    headline: null,
    mediaType: "Google creative",
    platform: "Google",
    sourceUrl:
      "https://adstransparency.google.com/advertiser/AR10100061036192202753/creative/CR16795721931746705409?region=US",
  },
};

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function imagePathFromUrl(creativeImageUrl) {
  if (!creativeImageUrl) return null;
  const filename = basename(creativeImageUrl);
  return `/evidence/ads/june-2026/${filename}`;
}

function imageExists(root, screenshotPath) {
  return screenshotPath
    ? existsSync(join(root, "public", screenshotPath.replace(/^\/+/u, "")))
    : false;
}

function platformLabel(value) {
  if (/google/iu.test(value ?? "")) return "Google";
  if (/meta|facebook/iu.test(value ?? "")) return "Meta";
  return "Site";
}

function mediaTypeLabel(value) {
  if (/google_search/iu.test(value ?? "")) return "Google Search";
  if (/public_web/iu.test(value ?? "")) return "Site capture";
  if (/meta/iu.test(value ?? "")) return "Meta";
  return null;
}

function normalizeCompetitor(value) {
  const brand = String(value ?? "").trim();
  if (/^xpat|remit2any/iu.test(brand)) return "Xpat";
  if (/western union/iu.test(brand)) return "Western Union";
  if (/moneygram/iu.test(brand)) return "MoneyGram";
  if (/instarem/iu.test(brand)) return "Instarem";
  if (/aspora/iu.test(brand)) return "Aspora";
  if (/abound/iu.test(brand)) return "Abound";
  if (/remitly/iu.test(brand)) return "Remitly";
  if (/wise/iu.test(brand)) return "Wise";
  if (/xoom/iu.test(brand)) return "Xoom";
  return brand;
}

function evidenceRole(competitor) {
  if (competitor === "Xpat") return "owned benchmark";
  if (CATEGORY_CONTEXT.has(competitor) || !TRACKED_COMPETITORS.has(competitor)) {
    return "category context";
  }
  return null;
}

function buildRecord({
  advertiser,
  brand,
  capturedAt = JUNE_CAPTURE_DATE,
  caveat = null,
  competitor,
  headline,
  id,
  landingPage = null,
  mediaType = null,
  platform,
  screenshotPath = null,
  sourceUrl,
}) {
  const normalizedCompetitor = normalizeCompetitor(competitor ?? brand ?? advertiser);
  const role = evidenceRole(normalizedCompetitor);

  return {
    advertiser: advertiser ?? null,
    bodyText: null,
    brand: brand ?? normalizedCompetitor,
    capturedAt,
    caveat,
    competitor: normalizedCompetitor,
    evidenceRole: role,
    firstSeen: null,
    headline: sanitizeAdDisplayText(headline),
    id,
    landingPage,
    lastShown: null,
    mediaType,
    placement: null,
    platform,
    screenshotPath,
    screenshotRawPath: null,
    sourceUrl: sourceUrl ?? landingPage,
    status: "snapshot",
    sweepLabel: "Jun 17, 2026 sweep",
    themes: role ? [role] : [],
  };
}

function publicAdExampleRecord(example, root) {
  const screenshotPath = imagePathFromUrl(example.creativeImageUrl);
  const hasImage = imageExists(root, screenshotPath);

  return buildRecord({
    advertiser: example.advertiser,
    brand: example.brand,
    caveat: hasImage
      ? null
      : "Original v1 publicAdExamples record did not include a committed PNG capture; source link and original capture date are preserved.",
    competitor: example.brand,
    headline: example.headline,
    id: `v1-${example.id}`,
    landingPage: example.landingPage,
    mediaType: mediaTypeLabel(example.platform),
    platform: platformLabel(example.platform),
    screenshotPath: hasImage ? screenshotPath : null,
    sourceUrl: example.sourceUrl,
  });
}

function sampleAdRecord(sample, observation, root) {
  const screenshotPath = imagePathFromUrl(sample.creativeImageUrl);
  if (!imageExists(root, screenshotPath)) return null;

  return buildRecord({
    advertiser: sample.advertiser,
    brand: observation.competitor,
    competitor: observation.competitor,
    headline: sample.headline,
    id: `v1-${sample.id}`,
    landingPage: sample.destination ? `https://${sample.destination}` : observation.sourceUrl,
    mediaType: mediaTypeLabel(observation.platform),
    platform: platformLabel(observation.platform),
    screenshotPath,
    sourceUrl: sample.sourceUrl ?? observation.sourceUrl,
  });
}

function fallbackRecord(filename, root) {
  const fallback = FILENAME_FALLBACKS[filename];
  if (!fallback) return null;

  const screenshotPath = `/evidence/ads/june-2026/${filename}`;
  if (!imageExists(root, screenshotPath)) return null;

  return buildRecord({
    ...fallback,
    caveat:
      "V1 retained this PNG capture without a structured sampleAd row; advertiser and source URL are derived from the filename and matching v1 observation.",
    id: `v1-${filename.replace(/\.png$/u, "")}`,
    screenshotPath,
  });
}

export function buildV1AdCaptureRecords({ root = process.cwd() } = {}) {
  const payload = readJsonIfExists(join(root, V1_OBSERVATIONS_FILE));
  if (!payload) return [];

  const records = [];
  const usedImages = new Set();

  for (const example of payload.publicAdExamples ?? []) {
    const record = publicAdExampleRecord(example, root);
    if (record.screenshotPath) usedImages.add(basename(record.screenshotPath));
    records.push(record);
  }

  for (const observation of [
    ...(payload.competitorAdSweeps ?? []),
    ...(payload.observations ?? []),
  ]) {
    for (const sample of observation.sampleAds ?? []) {
      const record = sampleAdRecord(sample, observation, root);
      if (!record || usedImages.has(basename(record.screenshotPath))) continue;
      usedImages.add(basename(record.screenshotPath));
      records.push(record);
    }
  }

  if (existsSync(join(root, JUNE_EVIDENCE_DIR))) {
    for (const filename of Object.keys(FILENAME_FALLBACKS)) {
      if (usedImages.has(filename)) continue;
      const record = fallbackRecord(filename, root);
      if (record) records.push(record);
    }
  }

  return records;
}
