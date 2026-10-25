#!/usr/bin/env node
/**
 * Teardown script for XPAT Ads Pipeline
 * 
 * WARNING: This will DELETE all resources including data!
 * 
 * Usage:
 *   node aws-scripts/teardown-ads-pipeline.mjs [options]
 * 
 * Options:
 *   --env dev|prod     Environment (default: dev)
 *   --force            Skip confirmation prompt
 *   --keep-data        Empty S3 bucket but don't delete stack (for testing)
 * 
 * Examples:
 *   node aws-scripts/teardown-ads-pipeline.mjs                    # Teardown dev (with prompt)
 *   node aws-scripts/teardown-ads-pipeline.mjs --env prod --force # Teardown prod (no prompt)
 */

import { execSync } from "child_process";
import { createInterface } from "readline";

const REGION = "ap-southeast-2";

// Parse CLI args
const args = process.argv.slice(2);
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "dev";
const force = args.includes("--force");
const keepData = args.includes("--keep-data");

const STACK_NAME = `xpat-ads-pipeline-${env}`;
const BUCKET_NAME = `xpat-ads-raw-data-${env}`;

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", encoding: "utf8", ...opts });
    return true;
  } catch (err) {
    if (opts.ignoreError) {
      console.log(`  (command failed, continuing...)`);
      return false;
    }
    throw err;
  }
}

function runCapture(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", ...opts }).trim();
  } catch {
    return null;
  }
}

async function confirm(message) {
  if (force) return true;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   XPAT Ads Pipeline - Teardown Script      ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`\nEnvironment: ${env}`);
  console.log(`Stack Name:  ${STACK_NAME}`);
  console.log(`Region:      ${REGION}`);

  // Check if stack exists
  const stackStatus = runCapture(
    `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query "Stacks[0].StackStatus" --output text`,
    { ignoreError: true }
  );

  if (!stackStatus) {
    console.log(`\n✓ Stack ${STACK_NAME} does not exist. Nothing to teardown.`);
    return;
  }

  console.log(`\nStack status: ${stackStatus}`);

  // Warn about data loss
  console.log("\n⚠️  WARNING: This will DELETE the following resources:");
  console.log(`   - S3 Bucket: ${BUCKET_NAME} (including all data)`);
  console.log(`   - DynamoDB Table: xpat-ads-intelligence-${env} (including all data)`);
  console.log(`   - Lambda Functions: xpat-ads-ingest-${env}, xpat-ads-transform-${env}`);
  console.log(`   - Secrets Manager: xpat-ads-pipeline/${env}/google-ads`);
  console.log(`   - IAM Roles, EventBridge Rules, and all other stack resources`);

  const confirmed = await confirm("\nAre you sure you want to proceed?");
  if (!confirmed) {
    console.log("\nTeardown cancelled.");
    return;
  }

  const startTime = Date.now();

  try {
    // Step 1: Empty S3 bucket (required before stack deletion)
    console.log("\n========================================");
    console.log("Step 1: Emptying S3 bucket");
    console.log("========================================");

    // Check if bucket exists
    const bucketExists = runCapture(
      `aws s3api head-bucket --bucket ${BUCKET_NAME} --region ${REGION}`,
      { ignoreError: true }
    );

    if (bucketExists !== null || !bucketExists?.includes("404")) {
      // Delete all objects (including versioned objects)
      console.log("\nDeleting all objects...");
      run(`aws s3 rm s3://${BUCKET_NAME} --recursive --region ${REGION}`, { ignoreError: true });

      // Delete all object versions (for versioned buckets)
      console.log("\nDeleting object versions...");
      const versions = runCapture(
        `aws s3api list-object-versions --bucket ${BUCKET_NAME} --region ${REGION} --query "Versions[].{Key:Key,VersionId:VersionId}" --output json`,
        { ignoreError: true }
      );

      if (versions && versions !== "null") {
        try {
          const versionList = JSON.parse(versions);
          if (versionList && versionList.length > 0) {
            // Delete in batches of 1000
            for (let i = 0; i < versionList.length; i += 1000) {
              const batch = versionList.slice(i, i + 1000);
              const deleteObjects = { Objects: batch.map(v => ({ Key: v.Key, VersionId: v.VersionId })) };
              const tempFile = `delete-objects-${Date.now()}.json`;
              require("fs").writeFileSync(tempFile, JSON.stringify(deleteObjects));
              run(`aws s3api delete-objects --bucket ${BUCKET_NAME} --delete file://${tempFile} --region ${REGION}`, { ignoreError: true });
              require("fs").unlinkSync(tempFile);
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Delete delete markers
      console.log("\nDeleting delete markers...");
      const deleteMarkers = runCapture(
        `aws s3api list-object-versions --bucket ${BUCKET_NAME} --region ${REGION} --query "DeleteMarkers[].{Key:Key,VersionId:VersionId}" --output json`,
        { ignoreError: true }
      );

      if (deleteMarkers && deleteMarkers !== "null") {
        try {
          const markerList = JSON.parse(deleteMarkers);
          if (markerList && markerList.length > 0) {
            for (let i = 0; i < markerList.length; i += 1000) {
              const batch = markerList.slice(i, i + 1000);
              const deleteObjects = { Objects: batch.map(v => ({ Key: v.Key, VersionId: v.VersionId })) };
              const tempFile = `delete-markers-${Date.now()}.json`;
              require("fs").writeFileSync(tempFile, JSON.stringify(deleteObjects));
              run(`aws s3api delete-objects --bucket ${BUCKET_NAME} --delete file://${tempFile} --region ${REGION}`, { ignoreError: true });
              require("fs").unlinkSync(tempFile);
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      console.log("✓ S3 bucket emptied");
    } else {
      console.log("S3 bucket does not exist, skipping...");
    }

    if (keepData) {
      console.log("\n--keep-data flag set, skipping stack deletion.");
      return;
    }

    // Step 2: Delete CloudFormation stack
    console.log("\n========================================");
    console.log("Step 2: Deleting CloudFormation stack");
    console.log("========================================");

    run(`aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}`);

    console.log("\nWaiting for stack deletion (this may take a few minutes)...");
    run(`aws cloudformation wait stack-delete-complete --stack-name ${STACK_NAME} --region ${REGION}`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n========================================");
    console.log(`✓ Teardown complete in ${elapsed}s`);
    console.log("========================================");
    console.log(`\nAll resources for ${STACK_NAME} have been deleted.`);

  } catch (err) {
    console.error("\n✗ Teardown failed:", err.message);
    console.log("\nYou may need to manually delete remaining resources:");
    console.log(`  aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}`);
    process.exit(1);
  }
}

main();
