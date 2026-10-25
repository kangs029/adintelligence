/**
 * deploy.mjs
 *
 * One-command deployment for the complete XPAT platform infrastructure.
 *
 * What this script does (in order):
 *   1. Validates required keys exist in .env.prod (fails loudly if any missing)
 *   2. Validates the CloudFormation template
 *   3. Tears down any existing stack (empties S3 buckets first)
 *   4. Deploys the full CloudFormation stack (Amplify + S3 + Lambda + EventBridge + IAM + Secrets)
 *   5. Populates Secrets Manager with ads API credentials from .env.prod
 *   6. Deploys the Lambda ZIP (bundles pipeline code)
 *   7. Triggers the first Lambda run to populate S3 with fresh ad data
 *   8. Prints the live Amplify URL
 *
 * Usage:
 *   node aws-scripts/deploy.mjs
 *
 * Reads ALL configuration from: .env.prod  (gitignored — never committed)
 * No fallbacks. No hardcoded values. Missing keys = explicit failure.
 */

import { execSync, execFileSync } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync,
  rmSync, writeFileSync, unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const REGION    = "ap-southeast-2"; // XPAT account home region — all infra except Bedrock
const BEDROCK_REGION = "us-east-1"; // Bedrock cross-region inference profiles only exist in US
const STACK_NAME = "xpat-ads-pipeline";
const TEMPLATE  = join(ROOT, "infra", "cloudformation.yaml");
const ENV_FILE  = join(ROOT, ".env.prod");
const DIST_DIR  = join(ROOT, "infra", "lambda", "dist");
const ZIP_PATH  = join(DIST_DIR, "xpat-ads-pipeline.zip");
const FUNCTION_NAME = "xpat-ads-pipeline";

// Use %TEMP% for file:// args to avoid Windows spaces-in-path issues with AWS CLI
const TMP_DIR      = process.env.TEMP ?? process.env.TMP ?? DIST_DIR;
const TMP_TEMPLATE = join(TMP_DIR, "xpat-cf-template.yaml");
const TMP_SECRET   = join(TMP_DIR, "xpat-secret.json");
const TMP_DELETE   = join(TMP_DIR, "xpat-s3-delete.json");

const BUCKETS = [
  "xpat-ads-raw-345692661102",
  "xpat-ads-normalized-345692661102",
];

// All keys that MUST exist in .env.prod — no fallbacks
const REQUIRED_KEYS = {
  // App
  XPAT_ACCESS_PASSWORD: "App access gate password",
  BEDROCK_MODEL_ID: "Bedrock model ID (e.g. us.anthropic.claude-sonnet-4-5-...)",
  // Meta Ads
  META_ACCESS_TOKEN: "Meta system user token",
  META_APP_ID: "Meta App ID",
  META_APP_SECRET: "Meta App Secret",
  META_AD_ACCOUNT_ID: "Meta Ad Account ID (act_...)",
  // Google Ads
  GOOGLE_ADS_DEVELOPER_TOKEN: "Google Ads developer token",
  GOOGLE_ADS_CLIENT_ID: "Google OAuth client ID",
  GOOGLE_ADS_CLIENT_SECRET: "Google OAuth client secret",
  GOOGLE_ADS_CUSTOMER_ID: "Google Ads customer ID",
  GOOGLE_ADS_REFRESH_TOKEN: "Google OAuth refresh token",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "Google Ads login customer ID",
};

const SECRET_KEYS = [
  "META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET", "META_AD_ACCOUNT_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg) { console.log(msg); }
function step(n, title) { log(`\n${"=".repeat(58)}\n  ${n}  ${title}\n${"=".repeat(58)}`); }

function aws(subcmd) {
  const cmd = `aws ${subcmd} --region ${REGION} --output json`;
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, output: out.trim() };
  } catch (err) {
    return { ok: false, output: err.stderr?.trim() ?? err.message };
  }
}

function awsInherit(subcmd) {
  try {
    execSync(`aws ${subcmd} --region ${REGION}`, { encoding: "utf8", stdio: "inherit", cwd: ROOT });
    return true;
  } catch { return false; }
}

function tmpPath(p) { return p.replace(/\\/g, "/"); }

function parseEnv(filePath) {
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Step 0 — Validate all required keys present in .env.prod
// ---------------------------------------------------------------------------
function validateEnv(env) {
  step("0/7", "Validating .env.prod");
  const missing = [];
  for (const [key, desc] of Object.entries(REQUIRED_KEYS)) {
    if (!env[key] || env[key].trim() === "") {
      missing.push(`  ✗ ${key.padEnd(32)} ${desc}`);
    }
  }
  if (missing.length > 0) {
    log("Missing required keys in .env.prod:");
    for (const m of missing) log(m);
    log("\nAdd these keys to .env.prod and re-run.");
    process.exit(1);
  }
  log(`✓ All ${Object.keys(REQUIRED_KEYS).length} required keys present`);
}

// ---------------------------------------------------------------------------
// Step 1 — Validate CloudFormation template
// ---------------------------------------------------------------------------
function validateTemplate() {
  step("1/7", "Validating CloudFormation template");
  // Copy to %TEMP% to avoid Windows spaces-in-path issue with file:// URLs
  writeFileSync(TMP_TEMPLATE, readFileSync(TEMPLATE, "utf8"));
  const { ok, output } = aws(
    `cloudformation validate-template --template-body file://${tmpPath(TMP_TEMPLATE)}`
  );
  unlinkSync(TMP_TEMPLATE);
  if (!ok) { log(`✗ Invalid template:\n${output}`); process.exit(1); }
  log("✓ Template is valid");
}

// ---------------------------------------------------------------------------
// Step 2 — Tear down existing stack
// ---------------------------------------------------------------------------
function emptyBucket(bucket) {
  const { ok } = aws(`s3api head-bucket --bucket ${bucket}`);
  if (!ok) { log(`  ⚠ ${bucket} not found — skipping`); return; }
  log(`  Emptying s3://${bucket}...`);
  let keyMarker = null, versionIdMarker = null, total = 0;
  do {
    let cmd = `s3api list-object-versions --bucket ${bucket} --max-keys 1000`;
    if (keyMarker) cmd += ` --key-marker "${keyMarker}"`;
    if (versionIdMarker) cmd += ` --version-id-marker "${versionIdMarker}"`;
    const { ok: ok2, output } = aws(cmd);
    if (!ok2 || !output) break;
    let res; try { res = JSON.parse(output); } catch { break; }
    const items = [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]
      .map(({ Key, VersionId }) => ({ Key, VersionId }));
    if (items.length > 0) {
      writeFileSync(TMP_DELETE, JSON.stringify({ Objects: items, Quiet: true }));
      const { ok: ok3 } = aws(
        `s3api delete-objects --bucket ${bucket} --delete file://${tmpPath(TMP_DELETE)}`
      );
      if (ok3) total += items.length;
    }
    keyMarker = res.NextKeyMarker ?? null;
    versionIdMarker = res.NextVersionIdMarker ?? null;
  } while (keyMarker || versionIdMarker);
  if (existsSync(TMP_DELETE)) unlinkSync(TMP_DELETE);
  log(`  ✓ Deleted ${total} versions`);
}

function teardownExisting() {
  const { ok } = aws(`cloudformation describe-stacks --stack-name ${STACK_NAME}`);
  if (!ok) { log("  No existing stack — fresh deploy"); return; }
  step("2/7", "Tearing down existing stack");
  for (const b of BUCKETS) emptyBucket(b);
  aws(`cloudformation delete-stack --stack-name ${STACK_NAME}`);
  log("  Waiting for deletion...");
  const { ok: w, output } = aws(`cloudformation wait stack-delete-complete --stack-name ${STACK_NAME}`);
  if (!w && output && !output.includes("does not exist")) {
    log(`  ✗ Deletion failed: ${output}`); process.exit(1);
  }
  log("  ✓ Stack deleted");
}

// ---------------------------------------------------------------------------
// Step 3 — Deploy CloudFormation stack
// ---------------------------------------------------------------------------
function deployStack(env) {
  step("3/7", "Deploying CloudFormation stack");

  // Use execFileSync with an argument array — bypasses the shell entirely.
  // No quoting, no escaping, no file:// path issues. Each arg is a separate element.
  log("  Deploying stack (2-4 min)...");
  try {
    execFileSync("aws", [
      "cloudformation", "deploy",
      "--template-file", TEMPLATE,
      "--stack-name", STACK_NAME,
      "--capabilities", "CAPABILITY_NAMED_IAM",
      "--region", REGION,
      "--parameter-overrides",
      `XpatAccessPassword=${env.XPAT_ACCESS_PASSWORD}`,
      `BedrockModelId=${env.BEDROCK_MODEL_ID}`,
      "PipelineSchedule=rate(2 days)",
    ], { stdio: "inherit", cwd: ROOT });
  } catch {
    log("✗ Stack deployment failed — check CloudFormation console");
    process.exit(1);
  }
  log("✓ Stack deployed");
}

// ---------------------------------------------------------------------------
// Step 3.5 — Push code to CodeCommit
// ---------------------------------------------------------------------------
function pushToCodeCommit() {
  step("3.5/7", "Pushing code to CodeCommit");

  // git-remote-codecommit uses codecommit:// scheme — no HTTPS credential issues
  const ccUrl = `codecommit::${REGION}://xpat_os`;

  try {
    execSync("git remote get-url codecommit", { cwd: ROOT, stdio: "pipe" });
    execSync(`git remote set-url codecommit ${ccUrl}`, { cwd: ROOT, stdio: "pipe" });
    log("  ✓ Updated codecommit remote");
  } catch {
    execSync(`git remote add codecommit ${ccUrl}`, { cwd: ROOT, stdio: "pipe" });
    log("  ✓ Added codecommit remote");
  }

  // On Windows, Python Scripts dir may not be in PATH — add it so git-remote-codecommit works
  const pythonScripts = "C:\\Users\\barua\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts";
  const env = { ...process.env };
  if (process.platform === "win32" && !process.env.PATH?.includes(pythonScripts)) {
    env.PATH = `${pythonScripts};${process.env.PATH}`;
  }

  log("  Pushing main branch to CodeCommit...");
  try {
    execSync("git push codecommit main --force", { cwd: ROOT, stdio: "inherit", env });
    log("  ✓ Code pushed — Amplify build will trigger automatically");
  } catch {
    log("  ✗ Push to CodeCommit failed");
    log(`  Add to PATH: ${pythonScripts}`);
    log("  Then re-run: git push codecommit main --force");
    process.exit(1);
  }
}
function populateSecret(env) {
  step("4/7", "Populating Secrets Manager");

  const secret = Object.fromEntries(
    SECRET_KEYS.filter(k => env[k]).map(k => [k, env[k]])
  );

  // Write to %TEMP% to avoid shell-escaping issues with JSON content
  writeFileSync(TMP_SECRET, JSON.stringify(secret));

  // Use the friendly name (not ARN) — avoids special-char issues in CLI args
  const { ok: putOk, output: putOut } = aws(
    `secretsmanager put-secret-value --secret-id "xpat/ads/credentials" --secret-string file://${tmpPath(TMP_SECRET)}`
  );
  unlinkSync(TMP_SECRET);

  if (!putOk) { log(`  ✗ Failed to write secret: ${putOut}`); process.exit(1); }
  log(`  ✓ ${Object.keys(secret).length} credentials written to Secrets Manager`);
}

// ---------------------------------------------------------------------------
// Step 5 — Build and deploy Lambda ZIP
// ---------------------------------------------------------------------------
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

function buildAndDeployLambda() {
  step("5/7", "Building and deploying Lambda");
  mkdirSync(DIST_DIR, { recursive: true });
  if (existsSync(ZIP_PATH)) rmSync(ZIP_PATH);

  const items = BUNDLE_ITEMS.filter(i => existsSync(join(ROOT, i)));
  log(`  Bundling ${items.length} items...`);

  if (process.platform === "win32") {
    // Write a single PowerShell script to %TEMP% — avoids multi-invocation and escaping issues
    const psScript = join(TMP_DIR, "xpat-build-zip.ps1");
    const lines = [
      "Add-Type -Assembly System.IO.Compression.FileSystem",
      `$zipPath = '${ZIP_PATH.replace(/'/g, "''")}'`,
      `[System.IO.Compression.ZipFile]::Open($zipPath, 'Create').Dispose()`,
      `$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Update')`,
    ];
    for (const item of items) {
      const full = join(ROOT, item);
      const isDir = existsSync(full) && !item.endsWith(".mjs");
      if (isDir) {
        lines.push(
          `Get-ChildItem -Path '${full.replace(/'/g, "''")}' -Recurse -File | ForEach-Object {`,
          `  $entryName = '${item}/' + $_.FullName.Substring(${full.length + 1}).Replace('\\', '/')`,
          `  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName) | Out-Null`,
          `}`,
        );
      } else {
        lines.push(
          `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${full.replace(/'/g, "''")}', '${item}') | Out-Null`,
        );
      }
    }
    lines.push("$zip.Dispose()");
    writeFileSync(psScript, lines.join("\n"), "utf8");
    execSync(`powershell -ExecutionPolicy Bypass -File "${psScript}"`, { stdio: "pipe" });
    unlinkSync(psScript);
  } else {
    execSync(`zip -r "${ZIP_PATH}" ${items.join(" ")}`, { cwd: ROOT, stdio: "pipe" });
  }

  const sizeMB = (readFileSync(ZIP_PATH).length / 1024 / 1024).toFixed(2);
  log(`  ✓ ZIP: ${sizeMB} MB`);

  // ZIP is in DIST_DIR which may have spaces — copy to TMP_DIR for fileb://
  const tmpZip = join(TMP_DIR, "xpat-lambda.zip");
  const zipBytes = readFileSync(ZIP_PATH);
  writeFileSync(tmpZip, zipBytes);

  const { ok } = aws(`lambda update-function-code --function-name ${FUNCTION_NAME} --zip-file fileb://${tmpPath(tmpZip)}`);
  unlinkSync(tmpZip);
  if (!ok) { log("  ✗ Lambda upload failed"); process.exit(1); }
  log("  ✓ Lambda deployed");
}

// ---------------------------------------------------------------------------
// Step 6 — First pipeline run
// ---------------------------------------------------------------------------
function invokeLambda() {
  step("6/7", "Running first pipeline");
  const outFile = tmpPath(join(TMP_DIR, "xpat-invoke.json"));
  const { ok } = aws(`lambda invoke --function-name ${FUNCTION_NAME} --log-type Tail ${outFile}`);
  if (!ok) { log("  ⚠ Invocation failed — run: node aws-scripts/invoke-pipeline.mjs"); return; }
  try {
    const r = JSON.parse(readFileSync(outFile, "utf8"));
    const b = typeof r.body === "string" ? JSON.parse(r.body) : r.body;
    log(`  ✓ status: ${b?.status}  records: ${b?.recordCount}`);
  } catch { log("  ✓ Invoked — check CloudWatch for results"); }
}

// ---------------------------------------------------------------------------
// Step 7 — Print outputs
// ---------------------------------------------------------------------------
function printOutputs() {
  step("7/7", "Complete");
  const { ok, output } = aws(`cloudformation describe-stacks --stack-name ${STACK_NAME} --query "Stacks[0].Outputs"`);
  if (!ok) return;
  const outputs = JSON.parse(output);
  log("\nStack outputs:");
  for (const o of outputs) log(`  ${o.OutputKey.padEnd(28)} ${o.OutputValue}`);
  const url = outputs.find(o => o.OutputKey === "AmplifyDefaultDomain");
  if (url) {
    log(`\n✓ App URL: ${url.OutputValue}`);
    log("  First Amplify build takes 3-5 min — check the Amplify console.");
  }
  log("\n  Re-run pipeline:  node aws-scripts/invoke-pipeline.mjs");
  log("  Destroy all:      node aws-scripts/teardown.mjs");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  log("=== XPAT Platform — Full Deploy ===");
  log(`Stack: ${STACK_NAME}  |  Region: ${REGION}  |  Config: .env.prod\n`);

  if (!existsSync(ENV_FILE)) {
    log("✗ .env.prod not found. Copy .env.example → .env.prod and fill in all values.");
    process.exit(1);
  }

  const env = parseEnv(ENV_FILE);

  validateEnv(env);
  validateTemplate();
  teardownExisting();
  deployStack(env);
  pushToCodeCommit();
  populateSecret(env);
  buildAndDeployLambda();
  invokeLambda();
  printOutputs();
}

main();
