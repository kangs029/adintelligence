#!/usr/bin/env node
/**
 * Deploy script for XPAT Ads Pipeline
 * 
 * Usage:
 *   node aws-scripts/deploy-ads-pipeline.mjs [options]
 * 
 * Options:
 *   --env dev|prod     Environment (default: dev)
 *   --stack-only       Deploy CloudFormation only (skip Lambda code)
 *   --lambda-only      Deploy Lambda code only (skip CloudFormation)
 *   --ingest-only      Deploy only ingest Lambda
 *   --transform-only   Deploy only transform Lambda
 * 
 * Examples:
 *   node aws-scripts/deploy-ads-pipeline.mjs                    # Full deploy to dev
 *   node aws-scripts/deploy-ads-pipeline.mjs --env prod         # Full deploy to prod
 *   node aws-scripts/deploy-ads-pipeline.mjs --lambda-only      # Update Lambda code only
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INFRA_DIR = join(ROOT, "infra", "ads-pipeline");
const REGION = "ap-southeast-2";

// Parse CLI args
const args = process.argv.slice(2);
const env = args.includes("--env") ? args[args.indexOf("--env") + 1] : "dev";
const stackOnly = args.includes("--stack-only");
const lambdaOnly = args.includes("--lambda-only");
const ingestOnly = args.includes("--ingest-only");
const transformOnly = args.includes("--transform-only");

const STACK_NAME = `xpat-ads-pipeline-${env}`;

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd: opts.cwd || ROOT, ...opts });
    return true;
  } catch (err) {
    if (opts.ignoreError) return false;
    throw err;
  }
}

function runCapture(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, { cwd: opts.cwd || ROOT, encoding: "utf8", ...opts }).trim();
  } catch (err) {
    if (opts.ignoreError) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Deploy CloudFormation Stack
// ---------------------------------------------------------------------------

function deployStack() {
  console.log("\n========================================");
  console.log(`Deploying CloudFormation stack: ${STACK_NAME}`);
  console.log("========================================");

  const templatePath = join(INFRA_DIR, "cloudformation.yaml");
  if (!existsSync(templatePath)) {
    throw new Error(`CloudFormation template not found: ${templatePath}`);
  }

  run(`aws cloudformation deploy \
    --template-file "${templatePath}" \
    --stack-name ${STACK_NAME} \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides Environment=${env} \
    --region ${REGION}`);

  console.log("\n✓ CloudFormation stack deployed");
}

// ---------------------------------------------------------------------------
// Build and Deploy Lambda
// ---------------------------------------------------------------------------

function deployLambda(name, functionName) {
  console.log("\n========================================");
  console.log(`Deploying Lambda: ${functionName}`);
  console.log("========================================");

  const lambdaDir = join(INFRA_DIR, "lambda", name);
  const zipPath = join(INFRA_DIR, `${name}-lambda.zip`);

  // Check if source exists
  if (!existsSync(join(lambdaDir, "index.mjs"))) {
    throw new Error(`Lambda source not found: ${lambdaDir}/index.mjs`);
  }

  // Install dependencies
  console.log("\n[1/3] Installing dependencies...");
  run("npm install", { cwd: lambdaDir });

  // Create zip (PowerShell on Windows, zip on Unix)
  console.log("\n[2/3] Creating deployment package...");
  const isWindows = process.platform === "win32";
  
  if (isWindows) {
    // Remove old zip if exists
    if (existsSync(zipPath)) {
      run(`Remove-Item "${zipPath}" -Force`, { shell: "powershell.exe", ignoreError: true });
    }
    run(`Compress-Archive -Path "${lambdaDir}\\*" -DestinationPath "${zipPath}" -Force`, { 
      shell: "powershell.exe" 
    });
  } else {
    run(`rm -f "${zipPath}"`);
    run(`zip -r "${zipPath}" .`, { cwd: lambdaDir });
  }

  // Deploy to Lambda
  console.log("\n[3/3] Updating Lambda function...");
  run(`aws lambda update-function-code \
    --function-name ${functionName} \
    --zip-file fileb://${zipPath} \
    --region ${REGION}`);

  // Wait for update to complete
  console.log("\nWaiting for Lambda to be ready...");
  run(`aws lambda wait function-updated \
    --function-name ${functionName} \
    --region ${REGION}`);

  console.log(`\n✓ Lambda ${functionName} deployed`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║   XPAT Ads Pipeline - Deployment Script    ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log(`\nEnvironment: ${env}`);
  console.log(`Stack Name:  ${STACK_NAME}`);
  console.log(`Region:      ${REGION}`);

  const startTime = Date.now();

  try {
    // Deploy CloudFormation if not lambda-only
    if (!lambdaOnly && !ingestOnly && !transformOnly) {
      deployStack();
    }

    // Deploy Lambdas if not stack-only
    if (!stackOnly) {
      if (!transformOnly) {
        deployLambda("ingest", `xpat-ads-ingest-${env}`);
      }
      if (!ingestOnly) {
        deployLambda("transform", `xpat-ads-transform-${env}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n========================================");
    console.log(`✓ Deployment complete in ${elapsed}s`);
    console.log("========================================");

    // Print useful info
    console.log("\nResources:");
    console.log(`  S3 Bucket:     xpat-ads-raw-data-${env}`);
    console.log(`  DynamoDB:      xpat-ads-intelligence-${env}`);
    console.log(`  Ingest Lambda: xpat-ads-ingest-${env}`);
    console.log(`  Transform:     xpat-ads-transform-${env}`);

    console.log("\nTo test ingest manually:");
    console.log(`  aws lambda invoke --function-name xpat-ads-ingest-${env} --region ${REGION} /dev/stdout`);

    console.log("\nTo test transform manually:");
    console.log(`  aws lambda invoke --function-name xpat-ads-transform-${env} --region ${REGION} --payload '{"date":"2026-10-12"}' /dev/stdout`);

  } catch (err) {
    console.error("\n✗ Deployment failed:", err.message);
    process.exit(1);
  }
}

main();
