/**
 * Single source of truth for AI model routing.
 *
 * Credentials (in order of preference):
 *   1. BEDROCK_ACCESS_KEY_ID + BEDROCK_SECRET_ACCESS_KEY  (Amplify prod — non-AWS prefix)
 *   2. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY           (local dev)
 *   3. IAM role via default credential chain               (Amplify service role fallback)
 */

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

// Always us-east-1 — cross-region inference profiles only exist in US
const BEDROCK_REGION = process.env.BEDROCK_AWS_REGION ?? "us-east-1";

// Vercel AI Gateway fallback
const GATEWAY_MODEL = "openai/gpt-5-mini" as const;

function getBedrockKeys() {
  // Amplify prod: keys stored with BEDROCK_ prefix to avoid AWS_ restriction
  if (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
      secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY,
    };
  }
  // Local dev: standard AWS key names
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  // IAM role fallback — no keys needed, SDK uses role automatically
  return null;
}

function createBedrockModel() {
  const keys = getBedrockKeys();
  const bedrock = createAmazonBedrock({
    region: BEDROCK_REGION,
    // When explicit keys are available use them directly.
    // Otherwise pass no credentials — the SDK default provider chain
    // will pick up the Amplify SSR compute role via IMDS automatically.
    ...(keys ? { accessKeyId: keys.accessKeyId, secretAccessKey: keys.secretAccessKey } : {}),
  });
  return bedrock(BEDROCK_MODEL_ID);
}

export function hasBedrockCredentials(): boolean {
  // Has explicit keys (local or Amplify with BEDROCK_ prefix)
  if (
    (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY) ||
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  ) {
    return true;
  }
  // Amplify environment detected — IAM role will provide credentials
  if (process.env.BEDROCK_MODEL_ID || process.env.NORMALIZED_BUCKET_NAME) {
    return true;
  }
  return false;
}

export function hasAiCredentials(): boolean {
  if (hasBedrockCredentials()) return true;
  if (process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY) return true;
  return Boolean(process.env.VERCEL);
}

export function getModel() {
  if (hasBedrockCredentials()) {
    return createBedrockModel();
  }
  return GATEWAY_MODEL as unknown as ReturnType<typeof createBedrockModel>;
}

export const BRIEF_MODEL = hasBedrockCredentials()
  ? (createBedrockModel() as unknown as typeof GATEWAY_MODEL)
  : GATEWAY_MODEL;
