/**
 * populate-secret.mjs
 *
 * Reads Meta and Google Ads credentials from .env.local and writes them
 * into the Secrets Manager secret created by the CloudFormation stack.
 *
 * Usage:
 *   node aws-scripts/populate-secret.mjs
 *
 * Requirements:
 *   - AWS CLI configured for account 345692661102 (XPAT), region us-east-1
 *   - .env.local present in xpat-os/ with all credential keys populated
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SecretsManagerClient,
  PutSecretValueCommand,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SECRET_ID = "xpat/ads/credentials";
const REGION = "us-east-1";

// Keys to extract from .env.local and push to Secrets Manager
const CREDENTIAL_KEYS = [
  "META_ACCESS_TOKEN",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_AD_ACCOUNT_ID",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
];

// ---------------------------------------------------------------------------
// Parse .env.local
// ---------------------------------------------------------------------------
function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== XPAT Ads — Populate Secrets Manager ===\n");

  // 1. Parse .env.prod
  const envPath = join(ROOT, ".env.prod");
  let envVars;
  try {
    envVars = parseEnvFile(envPath);
    console.log(`✓ Parsed ${envPath}`);
  } catch (err) {
    console.error(`✗ Could not read .env.prod: ${err.message}`);
    console.error(`  Create .env.prod from .env.example and add your credentials.`);
    process.exit(1);
  }

  // 2. Build secret object — only include keys that are set and non-empty
  const secret = {};
  const missing = [];

  for (const key of CREDENTIAL_KEYS) {
    const value = envVars[key];
    if (value && value.length > 0) {
      secret[key] = value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.warn(`\n⚠ The following keys are missing or empty in .env.local:`);
    for (const key of missing) {
      console.warn(`  - ${key}`);
    }
    console.warn("These will not be written to Secrets Manager.\n");
  }

  if (Object.keys(secret).length === 0) {
    console.error("✗ No credential keys found in .env.local. Nothing to write.");
    process.exit(1);
  }

  // 3. Show what will be written (keys only, never values)
  console.log("\nKeys to write to Secrets Manager:");
  for (const key of Object.keys(secret)) {
    console.log(`  ✓ ${key}`);
  }

  // 4. Connect to Secrets Manager
  const client = new SecretsManagerClient({ region: REGION });

  // 5. Verify the secret exists (created by CloudFormation)
  try {
    await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
    console.log(`\n✓ Secret '${SECRET_ID}' found in us-east-1`);
  } catch (err) {
    if (err.name === "ResourceNotFoundException") {
      console.error(
        `\n✗ Secret '${SECRET_ID}' not found. Deploy the CloudFormation stack first:\n` +
          "  aws cloudformation deploy --template-file infra/cloudformation.yaml " +
          "--stack-name xpat-ads-pipeline --capabilities CAPABILITY_NAMED_IAM --region us-east-1",
      );
    } else {
      console.error(`\n✗ Error accessing Secrets Manager: ${err.message}`);
    }
    process.exit(1);
  }

  // 6. Write the secret
  try {
    await client.send(
      new PutSecretValueCommand({
        SecretId: SECRET_ID,
        SecretString: JSON.stringify(secret, null, 2),
      }),
    );
    console.log(`\n✓ Secret '${SECRET_ID}' updated with ${Object.keys(secret).length} keys.`);
    console.log("\nDone. The Lambda will read these credentials on its next run.");
  } catch (err) {
    console.error(`\n✗ Failed to write secret: ${err.message}`);
    process.exit(1);
  }
}

main();
