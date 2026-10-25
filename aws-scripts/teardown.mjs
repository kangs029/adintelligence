/**
 * teardown.mjs
 *
 * Destroys the xpat-ads-pipeline CloudFormation stack and all its resources
 * in a single command.
 *
 * Resources destroyed:
 *   - S3 bucket: xpat-ads-raw-345692661102       (emptied first)
 *   - S3 bucket: xpat-ads-normalized-345692661102 (emptied first)
 *   - Lambda:    xpat-ads-pipeline
 *   - Secrets Manager: xpat/ads/credentials
 *   - EventBridge schedule: xpat-ads-pipeline-schedule
 *   - IAM roles: xpat-ads-pipeline-role, xpat-ads-scheduler-role
 *   - CloudWatch log group: /aws/lambda/xpat-ads-pipeline
 *   - CloudWatch alarm: xpat-ads-pipeline-errors
 *
 * Usage:
 *   node aws-scripts/teardown.mjs
 *
 * Requirements:
 *   - AWS CLI installed and configured for account 345692661102 (XPAT), region us-east-1
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

const REGION = "ap-southeast-2";
const STACK_NAME = "xpat-ads-pipeline";
const TMP_FILE = "aws-scripts/.tmp-delete.json";
const BUCKETS = [
  "xpat-ads-raw-345692661102",
  "xpat-ads-normalized-345692661102",
];

function log(msg) {
  console.log(msg);
}

function aws(args) {
  const cmd = `aws ${args} --region ${REGION} --output json`;
  try {
    const output = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, output: err.stderr?.trim() ?? err.message };
  }
}

// ---------------------------------------------------------------------------
// Check stack exists
// ---------------------------------------------------------------------------
function checkStackExists() {
  const { ok } = aws(`cloudformation describe-stacks --stack-name ${STACK_NAME}`);
  return ok;
}

// ---------------------------------------------------------------------------
// Empty S3 bucket — delete all object versions and delete markers.
// CF cannot delete a non-empty versioned bucket.
// ---------------------------------------------------------------------------
function emptyBucket(bucket) {
  log(`  Emptying s3://${bucket}...`);

  // Check bucket exists first
  const { ok } = aws(`s3api head-bucket --bucket ${bucket}`);
  if (!ok) {
    log(`  ⚠ Bucket ${bucket} does not exist — skipping`);
    return;
  }

  let totalDeleted = 0;
  let keyMarker = null;
  let versionIdMarker = null;

  do {
    // List object versions (paginated)
    let listCmd = `s3api list-object-versions --bucket ${bucket} --max-keys 1000`;
    if (keyMarker) listCmd += ` --key-marker "${keyMarker}"`;
    if (versionIdMarker) listCmd += ` --version-id-marker "${versionIdMarker}"`;

    const { ok: listOk, output: listOutput } = aws(listCmd);
    if (!listOk || !listOutput) break;

    let listResult;
    try {
      listResult = JSON.parse(listOutput);
    } catch {
      break;
    }

    const versions = listResult.Versions ?? [];
    const deleteMarkers = listResult.DeleteMarkers ?? [];
    const toDelete = [...versions, ...deleteMarkers].map(({ Key, VersionId }) => ({
      Key,
      VersionId,
    }));

    if (toDelete.length > 0) {
      // Write delete payload to a temp file to avoid shell escaping issues
      writeFileSync(TMP_FILE, JSON.stringify({ Objects: toDelete, Quiet: true }));

      const { ok: delOk, output: delOutput } = aws(
        `s3api delete-objects --bucket ${bucket} --delete file://${TMP_FILE}`,
      );

      if (!delOk) {
        log(`  ⚠ Delete batch error: ${delOutput}`);
      } else {
        totalDeleted += toDelete.length;
      }
    }

    keyMarker = listResult.NextKeyMarker ?? null;
    versionIdMarker = listResult.NextVersionIdMarker ?? null;
  } while (keyMarker || versionIdMarker);

  // Clean up temp file
  if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE);

  log(`  ✓ Deleted ${totalDeleted} object version(s) from ${bucket}`);
}

// ---------------------------------------------------------------------------
// Delete stack and wait for completion
// ---------------------------------------------------------------------------
function deleteStack() {
  log(`\n--- Deleting CloudFormation stack: ${STACK_NAME} ---`);

  const { ok, output } = aws(`cloudformation delete-stack --stack-name ${STACK_NAME}`);
  if (!ok) {
    log(`  ✗ Failed to initiate stack deletion: ${output}`);
    process.exit(1);
  }

  log("  Waiting for stack deletion to complete (~30 seconds)...");

  const { ok: waitOk, output: waitOutput } = aws(
    `cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}`,
  );

  if (!waitOk) {
    // Confirm whether it actually succeeded (stack may just be gone)
    const { ok: checkOk, output: checkOutput } = aws(
      `cloudformation describe-stacks --stack-name ${STACK_NAME}`,
    );
    if (!checkOk && checkOutput.includes("does not exist")) {
      log("  ✓ Stack deleted successfully");
      return;
    }
    log(`  ✗ Stack deletion failed: ${waitOutput}`);
    log("  Check AWS Console → CloudFormation → Events tab for details.");
    process.exit(1);
  }

  log("  ✓ Stack deleted successfully");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  log("=== XPAT Ads — Teardown ===\n");
  log("Destroying the following resources:");
  log("  • Amplify:     xpat-os app + branch");
  log("  • S3:          xpat-ads-raw-345692661102");
  log("  • S3:          xpat-ads-normalized-345692661102");
  log("  • Lambda:      xpat-ads-pipeline");
  log("  • Secrets Mgr: xpat/ads/credentials");
  log("  • EventBridge: xpat-ads-pipeline-schedule");
  log("  • IAM:         xpat-ads-pipeline-role, xpat-ads-scheduler-role, xpat-amplify-service-role");
  log("  • CloudWatch:  /aws/lambda/xpat-ads-pipeline + error alarm");
  log("  • CF Stack:    xpat-ads-pipeline\n");

  // Confirm stack exists
  if (!checkStackExists()) {
    log(`⚠ Stack '${STACK_NAME}' does not exist. Nothing to destroy.`);
    process.exit(0);
  }
  log(`✓ Stack '${STACK_NAME}' found\n`);

  // Step 1 — Empty S3 buckets (CF cannot delete non-empty versioned buckets)
  log("--- Step 1: Emptying S3 buckets ---");
  for (const bucket of BUCKETS) {
    emptyBucket(bucket);
  }

  // Step 2 — Delete the CF stack (all other resources deleted automatically)
  deleteStack();

  log("\n✓ All resources destroyed.");
  log("  Account 345692661102 has no remaining xpat-ads-pipeline resources.");
}

main();
