/**
 * pipeline/community/classify-sentiment.mjs
 *
 * Focused sentiment classification for the community sentiment panel.
 * Separate from classify.mjs which handles intent/direction/isRelevant for drafts.
 *
 * Asks Haiku one focused question per post:
 *   Is this post expressing positive or negative sentiment about
 *   US↔India money transfer / remittance?
 *
 * Writes a `communitysentiment` field to each thread (separate from `sentiment`
 * used by the draft classifier). sentiment-contexts.mjs reads this field.
 *
 * Usage:
 *   node pipeline/community/classify-sentiment.mjs          # only unclassified
 *   node pipeline/community/classify-sentiment.mjs --force  # reclassify all
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadPipelineEnv } from "../lib/env.mjs";
import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "community-threads.json");
const HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const BEDROCK_REGION = process.env.BEDROCK_AWS_REGION ?? "us-east-1";
const REQUEST_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Bedrock client
// ---------------------------------------------------------------------------

let _client = null;

async function getBedrockClient() {
  if (_client) return _client;
  const { BedrockRuntimeClient } = await import("@aws-sdk/client-bedrock-runtime");

  const credentials =
    process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID, secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY }
      : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        : undefined;

  _client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    ...(credentials ? { credentials } : {}),
  });
  return _client;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

// General prompt — overall post sentiment
const SYSTEM_OVERALL = [
  "You are analysing community threads about US↔India money transfer and remittance.",
  "Your only job is to determine the overall sentiment of each post.",
  "",
  "Definitions:",
  "  positive — the post expresses satisfaction, approval, or a good experience",
  "             with money transfer, remittance services, or the US↔India corridor.",
  "             Examples: happy with exchange rate, smooth transfer, recommending a service,",
  "             sharing a helpful tip or positive comparison, optimistic about a policy change.",
  "",
  "  negative — the post expresses frustration, complaint, loss, or a bad experience.",
  "             Examples: high fees, transfer stuck, poor exchange rate, regulatory frustration,",
  "             tax burden, bad customer service, losing money, service blocked.",
  "",
  "  neutral  — the post is asking a question, sharing neutral information, or the sentiment",
  "             is mixed/unclear. Examples: 'how do I send money to NRE account?',",
  "             'what is the remittance tax rate?', general news articles.",
  "",
  "Respond with ONLY a JSON object — no markdown, no explanation:",
  "{ \"sentiment\": \"positive\" | \"negative\" | \"neutral\" }",
].join("\n");

// XPAT-specific prompt — sentiment toward XPAT/Remit2Any only
const SYSTEM_XPAT = [
  "You are analysing community threads about US↔India money transfer.",
  "Your job is to determine how the post's author feels specifically about XPAT or Remit2Any.",
  "",
  "Focus ONLY on sentiment directed at XPAT/Remit2Any — ignore how they feel about other services.",
  "",
  "Definitions:",
  "  positive — the post recommends, praises, or expresses a good experience with XPAT/Remit2Any.",
  "             Examples: 'Remit2Any has great rates', 'I use XPAT, works well',",
  "             'switched to Remit2Any, very happy', 'anyone tried XPAT? looks legit'.",
  "",
  "  negative — the post warns against, criticises, or reports a bad experience with XPAT/Remit2Any.",
  "             Examples: 'beware of XPAT', 'Remit2Any is a scam', 'avoid XPAT',",
  "             'my transfer got stuck on Remit2Any', 'XPAT has hidden fees'.",
  "",
  "  neutral  — the post mentions XPAT/Remit2Any neutrally, asks about it, or",
  "             the sentiment is unclear. Examples: 'has anyone used Remit2Any?',",
  "             'comparing XPAT vs Wise rates', 'Remit2Any was mentioned in the thread'.",
  "",
  "Respond with ONLY a JSON object — no markdown, no explanation:",
  "{ \"sentiment\": \"positive\" | \"negative\" | \"neutral\" }",
].join("\n");

function buildPrompt(thread) {
  const text = [thread.title, thread.body ?? ""].filter(Boolean).join("\n").slice(0, 1000);
  // For XPAT-specific posts, ask about sentiment toward XPAT directly
  if (thread.xpatSpecific) {
    return `Post from r/${thread.subreddit}:\n\n${text}\n\nWhat is the sentiment toward XPAT/Remit2Any in this post?`;
  }
  return `Post from r/${thread.subreddit}:\n\n${text}\n\nWhat is the sentiment?`;
}

// ---------------------------------------------------------------------------
// Classify single thread
// ---------------------------------------------------------------------------

async function classifyOneSentiment(thread) {
  const { InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");
  const client = await getBedrockClient();

  // Use XPAT-focused prompt for posts that were fetched specifically because
  // they mention XPAT/Remit2Any — this gives us per-company sentiment directly
  const system = thread.xpatSpecific ? SYSTEM_XPAT : SYSTEM_OVERALL;

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 64,
    temperature: 0,
    system,
    messages: [{ role: "user", content: buildPrompt(thread) }],
  });

  const response = await client.send(new InvokeModelCommand({
    modelId: HAIKU_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  }));

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded);
  const rawText = parsed?.content?.[0]?.text ?? "";

  try {
    const clean = rawText.replace(/^```json\s*/u, "").replace(/\s*```$/u, "").trim();
    const result = JSON.parse(clean);
    const val = result?.sentiment;
    if (["positive", "negative", "neutral"].includes(val)) return val;
  } catch { /* fall through */ }

  return "neutral"; // safe default
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runClassifySentiment({ force = false, root = process.cwd() } = {}) {
  await loadPipelineEnv({ root });

  const artifactPath = join(root, ARTIFACT_FILE);

  if (!existsSync(artifactPath)) {
    throw new Error(`community-threads.json not found at ${artifactPath}`);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const threads = artifact?.data?.threads ?? [];

  const toClassify = force
    ? threads
    : threads.filter((t) => !t.communitysentimentAt);

  const already = threads.length - toClassify.length;
  console.log(`[classify-sentiment] ${toClassify.length} to classify, ${already} already done.`);

  if (toClassify.length === 0) {
    console.log("[classify-sentiment] Nothing to do. Use --force to reclassify.");
    return artifact;
  }

  const results = new Map();
  let errors = 0;

  for (let i = 0; i < toClassify.length; i++) {
    const thread = toClassify[i];
    try {
      const sentiment = await classifyOneSentiment(thread);
      results.set(thread.id, {
        ...thread,
        communitysentiment: sentiment,
        communitysentimentAt: new Date().toISOString(),
      });
      process.stdout.write(`[classify-sentiment] ${i + 1}/${toClassify.length} ${thread.id} → ${sentiment}\n`);
    } catch (err) {
      errors++;
      console.warn(`[classify-sentiment] ⚠  ${thread.id} — ${String(err?.message ?? err).slice(0, 80)}`);
      results.set(thread.id, thread); // keep original on error
    }

    if (i < toClassify.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const updatedThreads = threads.map((t) => results.get(t.id) ?? t);

  const counts = { positive: 0, negative: 0, neutral: 0 };
  for (const t of updatedThreads) {
    const s = t.communitysentiment ?? "neutral";
    counts[s] = (counts[s] || 0) + 1;
  }

  const updatedArtifact = {
    ...artifact,
    data: { ...artifact.data, threads: updatedThreads },
  };

  await writeDeterministicJsonPreservingArrays(artifactPath, updatedArtifact);

  console.log(`\n[classify-sentiment] Done. ${toClassify.length - errors} classified, ${errors} errors.`);
  console.log(`[classify-sentiment] positive: ${counts.positive} · negative: ${counts.negative} · neutral: ${counts.neutral}`);

  return updatedArtifact;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedPath = process.argv[1]
  ? new URL(`file://${process.argv[1]}`).pathname
  : "";

if (invokedPath === new URL(import.meta.url).pathname) {
  const force = process.argv.includes("--force");
  await runClassifySentiment({ force });
}
