/**
 * invoke-pipeline.mjs
 *
 * Manually triggers the xpat-ads-pipeline Lambda and streams the result.
 * Useful for testing after deploy or forcing a data refresh outside the schedule.
 *
 * Usage:
 *   node aws-scripts/invoke-pipeline.mjs
 *
 * Requirements:
 *   - AWS CLI configured for account 345692661102 (XPAT), region us-east-1
 *   - Lambda deployed (run deploy-lambda.mjs first)
 *   - Secret populated (run populate-secret.mjs first)
 */

import {
  LambdaClient,
  InvokeCommand,
  LogType,
} from "@aws-sdk/client-lambda";

const FUNCTION_NAME = "xpat-ads-pipeline";
const REGION = "us-east-1";

function log(msg) {
  console.log(msg);
}

function decodeBase64(str) {
  return Buffer.from(str, "base64").toString("utf8");
}

// ---------------------------------------------------------------------------
// Invoke Lambda
// ---------------------------------------------------------------------------
async function invokeLambda(client) {
  log("--- Invoking Lambda ---");
  log(`Function: ${FUNCTION_NAME}`);
  log(`Region:   ${REGION}`);
  log(`Time:     ${new Date().toISOString()}\n`);

  const start = Date.now();

  const response = await client.send(
    new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      LogType: LogType.Tail, // Returns last 4KB of logs in response
      Payload: JSON.stringify({}), // Empty event — scheduled run
    }),
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Decode response payload
  const payload = JSON.parse(Buffer.from(response.Payload).toString("utf8"));

  // Decode inline log tail (last 4KB)
  const logTail = response.LogResult ? decodeBase64(response.LogResult) : "";

  return { response, payload, logTail, elapsed };
}

// ---------------------------------------------------------------------------
// Fetch full logs from CloudWatch
// ---------------------------------------------------------------------------
// Print result summary
// ---------------------------------------------------------------------------
function printSummary({ response, payload, logTail, elapsed }) {
  const statusCode = response.StatusCode;
  const functionError = response.FunctionError;

  log("=== Result ===\n");
  log(`HTTP status:    ${statusCode}`);
  log(`Elapsed:        ${elapsed}s`);

  if (functionError) {
    log(`\n✗ Function error: ${functionError}`);
    log("\nError details:");
    console.error(JSON.stringify(payload, null, 2));
  } else {
    log(`\n✓ Lambda invoked successfully`);

    // Parse inner body if present
    let body = payload;
    if (payload?.body) {
      try {
        body = JSON.parse(payload.body);
      } catch {
        body = payload.body;
      }
    }

    log("\nPipeline summary:");
    log(`  Status:        ${body.status ?? "unknown"}`);
    log(`  Record count:  ${body.recordCount ?? "unknown"}`);
    log(`  Meta status:   ${body.metaStatus ?? "unknown"}`);
    log(`  Google status: ${body.googleStatus ?? "unknown"}`);
    log(`  Captured at:   ${body.capturedAt ?? "unknown"}`);
    log(`  Raw bucket:    ${body.rawBucket ?? "unknown"}`);
    log(`  Norm. bucket:  ${body.normalizedBucket ?? "unknown"}`);
  }

  // Print log tail
  if (logTail) {
    log("\n=== Lambda log tail (last 4KB) ===\n");
    log(logTail);
  }
}

// ---------------------------------------------------------------------------
// Verify S3 output
// ---------------------------------------------------------------------------
async function verifyS3Output() {
  log("\n=== Verifying S3 output ===\n");

  const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: REGION });
  const account = "345692661102";

  // Check raw bucket
  try {
    const rawResp = await s3.send(
      new ListObjectsV2Command({
        Bucket: `xpat-ads-raw-${account}`,
        MaxKeys: 10,
      }),
    );
    const rawCount = rawResp.Contents?.length ?? 0;
    log(`Raw bucket:        ${rawCount} object(s)`);
    for (const obj of rawResp.Contents ?? []) {
      const sizeMB = (obj.Size / 1024 / 1024).toFixed(2);
      log(`  s3://xpat-ads-raw-${account}/${obj.Key} (${sizeMB} MB, ${obj.LastModified.toISOString()})`);
    }
  } catch (err) {
    log(`  ⚠ Could not list raw bucket: ${err.message}`);
  }

  // Check normalized bucket
  try {
    const normResp = await s3.send(
      new ListObjectsV2Command({
        Bucket: `xpat-ads-normalized-${account}`,
        MaxKeys: 10,
      }),
    );
    const normCount = normResp.Contents?.length ?? 0;
    log(`\nNormalized bucket: ${normCount} object(s)`);
    for (const obj of normResp.Contents ?? []) {
      const sizeMB = (obj.Size / 1024 / 1024).toFixed(2);
      log(`  s3://xpat-ads-normalized-${account}/${obj.Key} (${sizeMB} MB, ${obj.LastModified.toISOString()})`);
    }
  } catch (err) {
    log(`  ⚠ Could not list normalized bucket: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log("=== XPAT Ads — Invoke Pipeline Lambda ===\n");

  const lambdaClient = new LambdaClient({ region: REGION });

  let result;
  try {
    result = await invokeLambda(lambdaClient);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      log(
        "✗ Lambda not found. Deploy it first:\n" +
          "  node aws-scripts/deploy-lambda.mjs",
      );
    } else {
      log(`✗ Invocation failed: ${err.message}`);
    }
    process.exit(1);
  }

  printSummary(result);

  // If successful, verify S3 output
  if (!result.response.FunctionError) {
    await verifyS3Output();
    log("\n✓ Done. The normalized artifact is ready in S3.");
    log(
      "  The Next.js app will read from s3://xpat-ads-normalized-345692661102/xpat-ad-performance.json",
    );
  }
}

main().catch((err) => {
  console.error(`\n✗ Unexpected error: ${err.message}`);
  process.exit(1);
});
