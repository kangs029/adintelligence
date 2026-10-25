/**
 * Lambda entry point for the xpat-ads pipeline.
 *
 * Execution flow:
 *  1. Read API credentials from Secrets Manager (SECRET_ARN env var)
 *  2. Set credentials as process.env so the pipeline modules pick them up
 *  3. Create an S3Client using the Lambda execution role (no explicit credentials needed)
 *  4. Run the full pipeline: Meta pull → Google pull → raw S3 save → normalize → normalized S3 save
 *
 * Environment variables (set by CloudFormation):
 *   SECRET_ARN          - Secrets Manager ARN for xpat/ads/credentials
 *   RAW_BUCKET_NAME     - S3 bucket for raw API responses
 *   NORMALIZED_BUCKET_NAME - S3 bucket for the normalized artifact
 *   AWS_REGION          - Injected automatically by the Lambda runtime
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { S3Client } from "@aws-sdk/client-s3";

// Import from the pipeline modules bundled into the Lambda ZIP.
// The ZIP is built from the repo root so paths are relative to the handler.
import { runXpatAds } from "../../pipeline/xpat-ads/run-xpat-ads.mjs";

const secretsClient = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
});

/**
 * Fetches the ads credentials secret and injects values into process.env.
 * This allows the pipeline modules to read credentials the same way they do locally.
 */
async function loadCredentialsFromSecret() {
  const secretArn = process.env.SECRET_ARN;
  if (!secretArn) {
    throw new Error("SECRET_ARN environment variable is not set.");
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  const secret = JSON.parse(response.SecretString);

  const credentialKeys = [
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

  for (const key of credentialKeys) {
    if (secret[key] && secret[key] !== "REPLACE_ME") {
      process.env[key] = secret[key];
    }
  }

  console.log("[handler] Credentials loaded from Secrets Manager.");
}

/**
 * Lambda handler.
 * EventBridge passes an event but we don't need its contents — this is a scheduled run.
 */
export const handler = async (event) => {
  console.log("[handler] xpat-ads pipeline triggered.", JSON.stringify(event ?? {}));

  const rawBucket = process.env.RAW_BUCKET_NAME;
  const normalizedBucket = process.env.NORMALIZED_BUCKET_NAME;

  if (!rawBucket || !normalizedBucket) {
    throw new Error(
      "RAW_BUCKET_NAME or NORMALIZED_BUCKET_NAME environment variable is not set.",
    );
  }

  await loadCredentialsFromSecret();

  const capturedAt = new Date().toISOString();

  const result = await runXpatAds({
    capturedAt,
    s3Client,
    rawBucket,
    normalizedBucket,
  });

  const summary = {
    status: result.data.status,
    recordCount: result.data.recordCount,
    metaStatus: result.data.metaStatus,
    googleStatus: result.data.googleStatus,
    capturedAt,
    rawBucket,
    normalizedBucket,
  };

  console.log("[handler] Pipeline complete.", JSON.stringify(summary));

  return {
    statusCode: 200,
    body: JSON.stringify(summary),
  };
};
