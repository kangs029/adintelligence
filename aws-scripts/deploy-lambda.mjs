/**
 * deploy-lambda.mjs
 *
 * Bundles the xpat-ads pipeline code into a ZIP and uploads it to the
 * Lambda function created by the CloudFormation stack.
 *
 * What gets bundled:
 *   - infra/lambda/handler.mjs       (Lambda entry point)
 *   - pipeline/xpat-ads/             (Meta + Google + normalize + orchestrator)
 *   - pipeline/lib/                  (provenance helpers)
 *   - node_modules/@aws-sdk/         (S3 + Secrets Manager clients)
 *   - node_modules/@smithy/          (AWS SDK internals)
 *
 * Usage:
 *   node aws-scripts/deploy-lambda.mjs
 *
 * Requirements:
 *   - AWS CLI configured for account 345692661102 (XPAT), region us-east-1
 *   - pnpm install already run (node_modules present)
 *   - Node.js 22.x
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LambdaClient,
  UpdateFunctionCodeCommand,
  GetFunctionCommand,
} from "@aws-sdk/client-lambda";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST_DIR = join(ROOT, "infra", "lambda", "dist");
const ZIP_PATH = join(DIST_DIR, "xpat-ads-pipeline.zip");
const FUNCTION_NAME = "xpat-ads-pipeline";
const REGION = "us-east-1";

// Files and directories to include in the ZIP (relative to ROOT)
const BUNDLE_ITEMS = [
  "infra/lambda/handler.mjs",
  "pipeline/xpat-ads",
  "pipeline/lib",
  "node_modules/@aws-sdk/client-s3",
  "node_modules/@aws-sdk/client-secrets-manager",
  "node_modules/@aws-sdk/core",
  "node_modules/@aws-sdk/credential-provider-env",
  "node_modules/@aws-sdk/credential-provider-node",
  "node_modules/@aws-sdk/credential-provider-ini",
  "node_modules/@aws-sdk/credential-provider-process",
  "node_modules/@aws-sdk/credential-provider-imds",
  "node_modules/@aws-sdk/credential-provider-http",
  "node_modules/@smithy",
  "node_modules/tslib",
];

function log(msg) {
  console.log(msg);
}

function runCmd(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// Check Lambda exists
// ---------------------------------------------------------------------------
async function checkLambdaExists(client) {
  try {
    const resp = await client.send(
      new GetFunctionCommand({ FunctionName: FUNCTION_NAME }),
    );
    log(`✓ Lambda '${FUNCTION_NAME}' found (runtime: ${resp.Configuration.Runtime})`);
    return true;
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      log(
        `✗ Lambda '${FUNCTION_NAME}' not found. Deploy the CloudFormation stack first:\n` +
          "  aws cloudformation deploy --template-file infra/cloudformation.yaml " +
          "--stack-name xpat-ads-pipeline --capabilities CAPABILITY_NAMED_IAM --region us-east-1",
      );
      return false;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Build ZIP
// ---------------------------------------------------------------------------
function buildZip() {
  log("\n--- Building Lambda ZIP ---");

  // Create dist directory
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }

  // Remove existing ZIP
  if (existsSync(ZIP_PATH)) {
    rmSync(ZIP_PATH);
    log("✓ Removed old ZIP");
  }

  // Check node_modules exists
  if (!existsSync(join(ROOT, "node_modules"))) {
    log("✗ node_modules not found. Run: pnpm install");
    process.exit(1);
  }

  // Filter to only items that actually exist
  const existingItems = BUNDLE_ITEMS.filter((item) => {
    const fullPath = join(ROOT, item.replace(/\//g, "\\"));
    const exists = existsSync(fullPath);
    if (!exists) {
      log(`  ⚠ Skipping (not found): ${item}`);
    }
    return exists;
  });

  log(`\nBundling ${existingItems.length} items into ZIP...`);

  // Use PowerShell on Windows, zip on Unix
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // PowerShell: compress each item individually into the ZIP
    const zipPathEscaped = ZIP_PATH.replace(/\\/g, "\\\\");

    // Create empty ZIP first via PowerShell
    const createCmd = `powershell -Command "Add-Type -Assembly System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::Open('${zipPathEscaped}', 'Create').Dispose()"`;
    runCmd(createCmd);

    for (const item of existingItems) {
      const fullPath = join(ROOT, item);
      const isDir = existsSync(fullPath) && !item.endsWith(".mjs");

      if (isDir) {
        // Add directory contents
        const psCmd = `powershell -Command "
          $zip = [System.IO.Compression.ZipFile]::Open('${zipPathEscaped}', 'Update')
          $files = Get-ChildItem -Path '${fullPath}' -Recurse -File
          foreach ($file in $files) {
            $entryName = '${item}/' + $file.FullName.Substring('${fullPath}'.Length + 1).Replace('\\\\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $entryName) | Out-Null
          }
          $zip.Dispose()
        "`;
        runCmd(psCmd);
        log(`  ✓ ${item}/`);
      } else {
        // Add single file
        const psCmd = `powershell -Command "
          $zip = [System.IO.Compression.ZipFile]::Open('${zipPathEscaped}', 'Update')
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${fullPath}', '${item}') | Out-Null
          $zip.Dispose()
        "`;
        runCmd(psCmd);
        log(`  ✓ ${item}`);
      }
    }
  } else {
    // Unix: use zip command
    const itemList = existingItems.join(" ");
    runCmd(`zip -r "${ZIP_PATH}" ${itemList}`);
  }

  const zipStats = readFileSync(ZIP_PATH);
  const sizeMB = (zipStats.length / 1024 / 1024).toFixed(2);
  log(`\n✓ ZIP created: ${ZIP_PATH} (${sizeMB} MB)`);

  if (zipStats.length > 250 * 1024 * 1024) {
    log("⚠ ZIP exceeds 250MB Lambda limit. Consider switching to a Docker container image.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Upload to Lambda
// ---------------------------------------------------------------------------
async function uploadToLambda(client) {
  log("\n--- Uploading to Lambda ---");

  const zipContents = readFileSync(ZIP_PATH);

  log(`Uploading ${(zipContents.length / 1024 / 1024).toFixed(2)} MB to '${FUNCTION_NAME}'...`);

  const response = await client.send(
    new UpdateFunctionCodeCommand({
      FunctionName: FUNCTION_NAME,
      ZipFile: zipContents,
    }),
  );

  log(`✓ Lambda updated successfully`);
  log(`  Runtime:      ${response.Runtime}`);
  log(`  Code size:    ${(response.CodeSize / 1024 / 1024).toFixed(2)} MB`);
  log(`  Last modified: ${response.LastModified}`);
  log(`  ARN:          ${response.FunctionArn}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log("=== XPAT Ads — Deploy Lambda ===\n");

  const client = new LambdaClient({ region: REGION });

  // Check Lambda exists
  const exists = await checkLambdaExists(client);
  if (!exists) process.exit(1);

  // Build ZIP
  buildZip();

  // Upload
  await uploadToLambda(client);

  log("\n✓ Deployment complete.");
  log("\nNext: invoke the Lambda manually to test:");
  log("  node aws-scripts/invoke-pipeline.mjs");
}

main().catch((err) => {
  console.error(`\n✗ Deploy failed: ${err.message}`);
  process.exit(1);
});
