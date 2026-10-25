import { runGooglePerformance } from "./google-performance.mjs";
import { runMetaPerformance } from "./meta-performance.mjs";
import { runNormalize } from "./normalize.mjs";

/**
 * Orchestrates the full xpat-ads pipeline run.
 *
 * When s3Client + rawBucket + normalizedBucket are provided (AWS Lambda context),
 * raw API responses are saved to the raw bucket and the normalized artifact is
 * written to the normalized bucket instead of local disk.
 *
 * When running locally (no S3 params), the pipeline writes to
 * data/artifacts/xpat-ad-performance.json as before.
 *
 * @param {object} opts
 * @param {string}  opts.capturedAt       - ISO timestamp for this run
 * @param {Function} opts.fetchImpl       - fetch implementation (override in tests)
 * @param {string}  opts.root             - project root for local file writes
 * @param {object}  opts.s3Client         - AWS SDK S3Client instance (optional)
 * @param {string}  opts.rawBucket        - S3 bucket name for raw responses (optional)
 * @param {string}  opts.normalizedBucket - S3 bucket name for normalized artifact (optional)
 */
export async function runXpatAds({
  capturedAt = new Date().toISOString(),
  fetchImpl = fetch,
  root = process.cwd(),
  s3Client = null,
  rawBucket = null,
  normalizedBucket = null,
} = {}) {
  console.log(`[xpat-ads] Starting ad performance sweep at ${capturedAt}`);
  if (s3Client) {
    console.log(`[xpat-ads] S3 mode — raw: ${rawBucket} | normalized: ${normalizedBucket}`);
  }

  const [metaArtifact, googleArtifact] = await Promise.all([
    runMetaPerformance({
      capturedAt,
      fetchImpl,
      s3Client,
      rawBucket,
    }),
    runGooglePerformance({
      capturedAt,
      fetchImpl,
      s3Client,
      rawBucket,
    }),
  ]);

  console.log(
    `[xpat-ads] Meta: ${metaArtifact.data.status} — ${metaArtifact.data.recordCount ?? 0} records`,
  );
  if (metaArtifact.data.errors?.length) {
    for (const err of metaArtifact.data.errors) {
      console.error(`[xpat-ads] Meta error: ${JSON.stringify(err)}`);
    }
  }

  console.log(
    `[xpat-ads] Google: ${googleArtifact.data.status} — ${googleArtifact.data.recordCount ?? 0} records`,
  );
  if (googleArtifact.data.errors?.length) {
    for (const err of googleArtifact.data.errors) {
      console.error(`[xpat-ads] Google error: ${JSON.stringify(err)}`);
    }
  }

  const unified = await runNormalize({
    capturedAt,
    googleArtifact,
    metaArtifact,
    root,
    s3Client,
    normalizedBucket,
  });

  console.log(
    `[xpat-ads] Unified artifact: ${unified.data.status} — ${unified.data.recordCount} records written`,
  );

  return unified;
}
