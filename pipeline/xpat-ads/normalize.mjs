import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

export const ARTIFACT_FILE = join("data", "artifacts", "xpat-ad-performance.json");
const MARKETS_FILE = join("data", "artifacts", "markets.json");

function readMarketsIfExists(root) {
  const filePath = join(root, MARKETS_FILE);
  if (!existsSync(filePath)) return [];
  try {
    const artifact = JSON.parse(readFileSync(filePath, "utf8"));
    return artifact?.data?.markets ?? [];
  } catch {
    return [];
  }
}

function buildGeoIndex(markets) {
  const index = new Map();

  for (const market of markets) {
    if (!market?.name || !market?.geoid) continue;

    const name = market.name.toLowerCase().trim();
    index.set(name, { geoid: market.geoid, name: market.name });

    const parts = name.split(/[-,]/u).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.length >= 3 && !index.has(part)) {
        index.set(part, { geoid: market.geoid, name: market.name });
      }
    }
  }

  return index;
}

export function matchGeoName(campaignName, geoIndex) {
  if (!campaignName || geoIndex.size === 0) return null;

  // Normalize underscores to spaces so "San_Jose" matches "san jose"
  const lower = campaignName.toLowerCase().replace(/_/gu, " ");

  for (const [key, value] of geoIndex) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return null;
}

export function mergeAndDedup(metaRecords, googleRecords) {
  const seen = new Set();
  const merged = [];

  for (const record of [...metaRecords, ...googleRecords]) {
    if (!record) continue;
    const key = `${record.platform}#${record.campaignId}#${record.adSetId ?? ""}#${record.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }

  return merged.sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.spendUsd - left.spendUsd,
  );
}

export function enrichWithGeo(records, geoIndex) {
  return records.map((record) => {
    if (record.geoId) return record;

    const match = matchGeoName(record.campaignName, geoIndex);
    if (!match) return record;

    return {
      ...record,
      geoId: match.geoid,
      geoName: match.name,
    };
  });
}

export function buildUnifiedArtifact({
  capturedAt = new Date().toISOString(),
  records,
  metaStatus,
  googleStatus,
  metaErrors = [],
  googleErrors = [],
}) {
  const validRecords = records.filter(Boolean);

  const platforms = [];
  if (metaStatus === "ok" || metaStatus === "error") platforms.push("Meta");
  if (googleStatus === "ok" || googleStatus === "error") platforms.push("Google");

  const overallStatus =
    metaStatus === "ok" && googleStatus === "ok"
      ? "ok"
      : metaStatus === "blocked" && googleStatus === "blocked"
        ? "blocked"
        : "partial";

  const allErrors = [
    ...metaErrors.map((error) => ({ ...error, platform: "Meta" })),
    ...googleErrors.map((error) => ({ ...error, platform: "Google" })),
  ];

  const dateRange = validRecords.length > 0
    ? {
        from: validRecords.reduce((min, record) => (record.date < min ? record.date : min), validRecords[0].date),
        to: validRecords.reduce((max, record) => (record.date > max ? record.date : max), validRecords[0].date),
      }
    : null;

  return {
    meta: {
      caveats: [
        "Meta and Google use different attribution windows — conversion counts are not directly comparable.",
        "Spend figures are reported by each platform and may differ from actual billed amounts.",
        "Geographic matching is based on campaign name pattern — not all campaigns will have a geoId.",
        "Platform-reported conversions are not verified customer conversions (signup/KYC/transfer).",
      ],
      family: "xpat-ad-performance",
      generatedAt: capturedAt,
      method:
        "Authenticated read-only pull from XPAT Meta and Google Ads accounts, normalized to a unified schema and deduplicated by platform+campaign+adset+date.",
      provenance: overallStatus === "blocked" ? "connector-needed" : "live",
      refreshCadence: "every 6 hours",
      source: "Meta Marketing API v20.0 + Google Ads API v17",
      version: 1,
    },
    data: {
      dateRange,
      errors: allErrors,
      googleStatus,
      metaStatus,
      platforms,
      recordCount: validRecords.length,
      records: validRecords,
      status: overallStatus,
    },
  };
}

/**
 * Writes the normalized artifact to S3.
 * Key: xpat-ad-performance.json (always the same key — S3 versioning keeps history)
 *
 * @param {object} opts
 * @param {object} opts.s3Client     - AWS SDK S3Client instance
 * @param {string} opts.bucket       - S3 bucket name
 * @param {object} opts.artifact     - The normalized artifact object
 */
async function writeArtifactToS3({ s3Client, bucket, artifact }) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const key = "xpat-ad-performance.json";
  const body = `${JSON.stringify(artifact, null, 2)}\n`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
    }),
  );
  console.log(`[normalize] Artifact written to s3://${bucket}/${key} (${artifact.data.recordCount} records)`);
}

export async function runNormalize({
  capturedAt = new Date().toISOString(),
  googleArtifact,
  metaArtifact,
  root = process.cwd(),
  // Optional: pass an S3Client and bucket to write the artifact to S3 instead of local disk.
  s3Client = null,
  normalizedBucket = null,
} = {}) {
  const markets = readMarketsIfExists(root);
  const geoIndex = buildGeoIndex(markets);

  const metaRecords = metaArtifact?.data?.records ?? [];
  const googleRecords = googleArtifact?.data?.records ?? [];

  const merged = mergeAndDedup(metaRecords, googleRecords);
  const enriched = enrichWithGeo(merged, geoIndex);

  const artifact = buildUnifiedArtifact({
    capturedAt,
    googleErrors: googleArtifact?.data?.errors ?? [],
    googleStatus: googleArtifact?.data?.status ?? "blocked",
    metaErrors: metaArtifact?.data?.errors ?? [],
    metaStatus: metaArtifact?.data?.status ?? "blocked",
    records: enriched,
  });

  if (s3Client && normalizedBucket) {
    // AWS context: write to S3.
    await writeArtifactToS3({ s3Client, bucket: normalizedBucket, artifact });
  } else {
    // Local context: write to disk as before.
    const artifactPath = join(root, ARTIFACT_FILE);
    await writeDeterministicJsonPreservingArrays(artifactPath, artifact);
  }

  return artifact;
}
