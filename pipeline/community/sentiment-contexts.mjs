/**
 * pipeline/community/sentiment-contexts.mjs
 *
 * Reads community-threads.json, generates sentiment themes:
 *   1. Overall — all threads grouped by sentiment
 *   2. Per-company — threads mentioning each company, grouped by sentiment
 *
 * Time filter support: threads can be filtered to last 3 months, last year, or all.
 * The artifact stores contexts for all three windows so the UI can switch without re-running.
 *
 * Output: data/artifacts/community-sentiment-contexts.json
 *
 * Usage:
 *   node pipeline/community/sentiment-contexts.mjs
 *   node pipeline/community/sentiment-contexts.mjs --force
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadPipelineEnv } from "../lib/env.mjs";
import { writeDeterministicJson } from "../lib/provenance.mjs";

const THREADS_FILE  = join("data", "artifacts", "community-threads.json");
const ARTIFACT_FILE = join("data", "artifacts", "community-sentiment-contexts.json");

const HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const BEDROCK_REGION = process.env.BEDROCK_AWS_REGION ?? "us-east-1";

// Companies to generate per-company sentiment for
const COMPANIES = ["XPAT", "Wise", "Remitly", "Xoom", "Western Union"];

// Aliases so we match all variants
const COMPANY_ALIASES = {
  "XPAT":          ["XPAT", "Remit2any", "Remit2Any", "xpat", "remit2any", "xpat.money", "remit2any.com"],
  "Wise":          ["Wise", "TransferWise", "wise", "transferwise"],
  "Remitly":       ["Remitly", "remitly"],
  "Xoom":          ["Xoom", "xoom"],
  "Western Union": ["Western Union", "western union", "WU"],
};

// ---------------------------------------------------------------------------
// Haiku client
// ---------------------------------------------------------------------------

async function invokeHaiku(system, user) {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock-runtime");

  const credentials =
    process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID, secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY }
      : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
        : undefined;

  const client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    ...(credentials ? { credentials } : {}),
  });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    temperature: 0,
    system,
    messages: [{ role: "user", content: user }],
  });

  const response = await client.send(new InvokeModelCommand({
    modelId: HAIKU_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  }));

  const decoded = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(decoded);
  return parsed?.content?.[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Time filter helpers
// ---------------------------------------------------------------------------

function filterByTime(threads, window) {
  if (window === "all") return threads;
  const now = new Date();
  const cutoff = new Date(now);
  if (window === "3months") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (window === "1year") cutoff.setFullYear(cutoff.getFullYear() - 1);
  return threads.filter(t => {
    if (!t.publishedAt) return window === "all";
    return new Date(t.publishedAt) >= cutoff;
  });
}

// ---------------------------------------------------------------------------
// XPAT relevance filter — remove off-topic threads before theme generation
// ---------------------------------------------------------------------------

// 1. US↔India corridor keywords
const CORRIDOR_PATTERNS = [
  /send.{0,25}money.{0,25}india/i,
  /india.{0,25}send.{0,25}money/i,
  /transfer.{0,25}(india|inr|rupee)/i,
  /remit(tance)?.{0,25}india/i,
  /india.{0,25}remit(tance)?/i,
  /usd.{0,20}(to.{0,5})?inr/i,
  /inr.{0,20}(to.{0,5})?usd/i,
  /money.{0,20}(india|inr)/i,
  /india.{0,20}money/i,
  /\b(us|usa|united states|america).{0,30}india.{0,30}(money|transfer|send|remit)/i,
  /india.{0,30}(us|usa|united states|america).{0,30}(money|transfer|send|remit)/i,
  /wire.{0,20}india/i,
  /forex.{0,20}india/i,
  /exchange rate.{0,20}india/i,
  /india.{0,20}exchange rate/i,
];

const BANKING_PATTERNS = [
  /\bnre\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bnro\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bfcnr\b.{0,40}(transfer|send|remit|wire|move money)/i,
  /(transfer|send|remit|wire).{0,40}\bfcnr\b/i,
  /(transfer|send|remit).{0,40}\bnre\b/i,
  /(transfer|send|remit).{0,40}\bnro\b/i,
];

const COMPETITOR_PATTERNS = [
  /\bwise\b.{0,50}india/i,
  /india.{0,50}\bwise\b/i,
  /\bremitly\b/i,
  /\bxoom\b/i,
  /\btaptap\b/i,
  /\binstarem\b/i,
  /\babound\b/i,
  /\baspora\b/i,
  /\bremit2any\b/i,
  /\bunplex\b/i,
  /western union.{0,30}india/i,
  /india.{0,30}western union/i,
];

const PAIN_PATTERNS = [
  /transfer.{0,20}(fail|stuck|delay|pending|missing)/i,
  /(fail|stuck|delay|pending|missing).{0,20}transfer/i,
  /send money.{0,20}parents/i,
  /parents.{0,20}send money/i,
  /send money.{0,20}family/i,
  /family.{0,20}send money/i,
  /best.{0,20}(app|way|service|platform).{0,20}send.{0,20}india/i,
  /best.{0,20}(app|way|service|platform).{0,20}(remit|transfer).{0,20}india/i,
  /cheapest.{0,30}india/i,
  /fees.{0,20}(remit|transfer|send).{0,20}india/i,
  /(remit|transfer|send).{0,20}fees.{0,20}india/i,
  /hidden.{0,20}(fee|charge)/i,
  /exchange rate.{0,20}(wise|remitly|xoom|bank)/i,
  /how.{0,20}send.{0,20}money.{0,20}india/i,
  /how.{0,20}transfer.{0,20}money.{0,20}india/i,
  /upi.{0,20}india.{0,20}(usa|us\b)/i,
];

const CONTEXT_PATTERNS = [
  /nri.{0,30}(send|transfer|remit|money|fund)/i,
  /(send|transfer|remit|money|fund).{0,30}nri/i,
  /h1b.{0,30}(send|transfer|remit|money|india)/i,
  /401k.{0,30}india/i,
  /india.{0,30}401k/i,
  /us.{0,10}india.{0,10}remittance/i,
  /remittance.{0,20}(us|usa|h1b|nri)/i,
];

const EXCLUDE_PATTERNS = [
  /h1b.{0,30}(transfer|stamp|petition|lottery|extension|cos|uscis|approval|denial)/i,
  /visa.{0,20}(stamp|interview|petition|approve|deni)/i,
  /oci\b(?!.{0,30}(money|transfer|remit|send|fund))/i,
  /passport.{0,20}(renew|expire|lost|appoint)/i,
  /\b(cricket|ipl|bollywood|movie|film|music)\b/i,
  /\b(election|bjp|congress|modi|politics|vote)\b/i,
  /\b(covid|cancer|hospital|medical|disease)\b(?!.{0,30}(money|fund|transfer))/i,
  /india.{0,20}(uk|canada|australia|uae|gulf|dubai|singapore|germany).{0,20}(transfer|remit|send)/i,
  // Physical shipping / documents — not money transfer
  /send(ing)?.{0,20}(documents?|papers?|parcels?|packages?|mail)/i,
  /\b(fedex|ups|dhl|usps|parcel monkey|pirate ship|shiprocket)\b/i,
  /notariz(ed|ation)|power of attorney/i,
  // Deposit conversion timing / account mechanics — not a transfer decision
  /when to convert.{0,30}(nre|nro|fcnr|deposit)/i,
  /convert.{0,20}(nre|nro|fcnr).{0,20}(deposit|after return)/i,
  // Bank account selection — not remittance
  /best.{0,20}(us|usa)?\s*(bank|checking|savings)\s*account/i,
  /which.{0,20}(bank|account).{0,20}(returnee|return to india|rnor)/i,
];

function isXpatRelevant(thread) {
  // xpatSpecific posts (manually fetched from XPAT post URLs) always pass
  if (thread.xpatSpecific) return true;

  const text = `${thread.title ?? ""} ${thread.body ?? ""}`;

  for (const p of EXCLUDE_PATTERNS) {
    if (p.test(text)) return false;
  }

  return (
    CORRIDOR_PATTERNS.some(p => p.test(text)) ||
    BANKING_PATTERNS.some(p => p.test(text)) ||
    COMPETITOR_PATTERNS.some(p => p.test(text)) ||
    PAIN_PATTERNS.some(p => p.test(text)) ||
    CONTEXT_PATTERNS.some(p => p.test(text))
  );
}

// ---------------------------------------------------------------------------
// Company filter — thread mentions this company
// ---------------------------------------------------------------------------

function threadMentionsCompany(thread, company) {
  const aliases = COMPANY_ALIASES[company] ?? [company];
  const haystack = [
    thread.title ?? "",
    thread.body ?? "",
    ...(thread.competitorMentions ?? []),
    ...(thread.matchedQueries ?? []),
  ].join(" ").toLowerCase();

  return aliases.some(alias => haystack.includes(alias.toLowerCase()));
}

// ---------------------------------------------------------------------------
// For per-company contexts, determine sentiment ABOUT THAT COMPANY.
// Uses sentence-level keyword analysis scoped to sentences that name the
// company. For xpatSpecific posts, if keyword analysis is tied/neutral,
// falls back to the Haiku-classified communitysentiment.
// ---------------------------------------------------------------------------

// Signals that strongly indicate negative sentiment toward the company
const NEGATIVE_SIGNALS = [
  "scam", "fraud", "beware", "beaware", "be aware", "be warned", "warning", "avoid",
  "stay away", "problem", "issue", "stuck", "failed", "rejected", "blocked",
  "hidden fee", "hidden charge", "slow", "terrible", "horrible", "worst",
  "bad experience", "complaint", "not recommend", "not legit", "not trustworthy",
  "suspicious", "raid", "violation", "illegal", "enforcement",
];

// Signals that strongly indicate positive sentiment toward the company
const POSITIVE_SIGNALS = [
  "i use", "i'm using", "i am using", "been using", "we use", "started using",
  "switched to", "using it", "use remit2any", "use xpat",
  "gives the best", "best transfer rate", "best rate", "best rates",
  "great", "good", "excellent", "love", "recommend", "smooth", "fast", "easy",
  "transparent", "reliable", "trusted", "trustworthy", "no issues", "no problem",
  "happy with", "satisfied", "decent", "solid", "works well", "worked well",
  "worth trying", "competitive rate",
];

function sentimentAboutCompany(thread, company) {
  const aliases = COMPANY_ALIASES[company] ?? [company];
  const fullText = [thread.title ?? "", thread.body ?? ""].join(" ").toLowerCase();

  // Find sentences/clauses that mention this company
  const sentences = fullText.split(/[.!?\n]/);
  const relevantSentences = sentences.filter(s =>
    aliases.some(a => s.includes(a.toLowerCase()))
  );

  // If no sentence explicitly names the company, fall back:
  // for xpatSpecific (targeted fetch) trust the Haiku label, else neutral
  if (relevantSentences.length === 0) {
    return thread.communitysentiment ?? "neutral";
  }

  const combined = relevantSentences.join(" ");
  const negCount = NEGATIVE_SIGNALS.filter(s => combined.includes(s)).length;
  const posCount = POSITIVE_SIGNALS.filter(s => combined.includes(s)).length;

  if (negCount > posCount) return "negative";
  if (posCount > negCount) return "positive";

  // Tied — for xpatSpecific posts the Haiku model was asked specifically about
  // XPAT sentiment, so trust it as tiebreaker. For others default neutral.
  if (thread.xpatSpecific && thread.communitysentiment && thread.communitysentiment !== "neutral") {
    return thread.communitysentiment;
  }
  return "neutral";
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildContextPrompt(sentiment, threads, company = null) {
  const companyContext = company
    ? [
        `These posts mention ${company}.`,
        `Focus ONLY on what people are saying ABOUT ${company} specifically — not about other services mentioned in the same post.`,
        `The sentiment here (${sentiment}) reflects how people feel about ${company}.`,
      ].join(" ")
    : "These are general remittance community posts.";

  const system = [
    "You are analysing community threads about US↔India money transfer and remittance.",
    companyContext,
    "Your job is to identify 3-5 recurring themes across the posts provided.",
    "",
    "Each theme must:",
    "- Represent something multiple posts are saying (not a single post)",
    "- Have a short label (3-6 words)",
    "- Have a one-sentence summary capturing the collective voice",
    company ? `- Focus on what people say about ${company}, not general remittance topics` : "",
    "- Include the IDs of all posts that support this theme",
    "",
    "IMPORTANT — merge overlapping themes:",
    "- If two potential themes are about the same underlying issue, merge them into ONE theme",
    "- Quality over quantity — 3 distinct themes is better than 5 overlapping ones",
    "",
    "Return ONLY a valid JSON object — no markdown, no explanation:",
    "{",
    "  \"themes\": [",
    "    {",
    "      \"label\": \"string — short theme name\",",
    "      \"summary\": \"string — one sentence capturing what people are saying\",",
    "      \"threadIds\": [\"string\", ...]",
    "    }",
    "  ]",
    "}",
    "",
    `You are analysing ${sentiment} posts${company ? ` about ${company}` : ""}. Find what they collectively express.`,
    "If fewer than 3 distinct themes exist, return only what genuinely exists.",
  ].filter(Boolean).join("\n");

  const postLines = threads.map(t =>
    `[${t.id}] ${t.title}${t.body ? ` — ${t.body.slice(0, 200)}` : ""}`
  ).join("\n");

  const user = [
    `Here are ${threads.length} ${sentiment} community threads:`,
    "",
    postLines,
    "",
    "Identify 3-5 recurring themes. Return JSON only.",
  ].join("\n");

  return { system, user };
}

// ---------------------------------------------------------------------------
// Parse Haiku response
// ---------------------------------------------------------------------------

function parseThemes(rawText, sentiment, prefix = "overall") {
  try {
    const clean = rawText.replace(/^```json\s*/u, "").replace(/\s*```$/u, "").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed.themes)) return [];
    return parsed.themes
      .filter(t => t.label && t.summary && Array.isArray(t.threadIds))
      .map((t, i) => ({
        id: `${prefix}-${sentiment}-${i + 1}`,
        label: String(t.label).trim(),
        summary: String(t.summary).trim(),
        threadIds: t.threadIds.map(String),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Generate contexts for a set of threads (one sentiment group)
// ---------------------------------------------------------------------------

async function generateContexts(threads, label, company = null) {
  // For per-company contexts, use sentence-level sentiment about that company.
  // For overall contexts, use the Haiku-classified `communitysentiment` field
  // (written by classify-sentiment.mjs), falling back to neutral if missing.
  const getSentiment = (t) => company
    ? sentimentAboutCompany(t, company)
    : (t.communitysentiment ?? "neutral");

  const positive = threads.filter(t => getSentiment(t) === "positive");
  const negative = threads.filter(t => getSentiment(t) === "negative");
  const neutral  = threads.filter(t => getSentiment(t) === "neutral");

  const counts = {
    positive: positive.length,
    negative: negative.length,
    neutral: neutral.length,
    total: threads.length,
  };

  const contexts = { positive: [], negative: [] };
  const prefix = company ? company.toLowerCase().replace(/\s+/g, "-") : "overall";

  // For XPAT we lower the threshold to 1 — even a single post is meaningful
  // signal for our own product. For other companies keep ≥2 to avoid noise.
  const threshold = (company === "XPAT") ? 1 : 2;

  if (positive.length >= threshold) {
    console.log(`  [${label}] Generating positive themes from ${positive.length} posts...`);
    const { system, user } = buildContextPrompt("positive", positive, company);
    const raw = await invokeHaiku(system, user);
    contexts.positive = parseThemes(raw, "positive", prefix);
    console.log(`  [${label}] → ${contexts.positive.length} positive themes`);
    await new Promise(r => setTimeout(r, 1500));
  }

  if (negative.length >= threshold) {
    console.log(`  [${label}] Generating negative themes from ${negative.length} posts...`);
    const { system, user } = buildContextPrompt("negative", negative, company);
    const raw = await invokeHaiku(system, user);
    contexts.negative = parseThemes(raw, "negative", prefix);
    console.log(`  [${label}] → ${contexts.negative.length} negative themes`);
    await new Promise(r => setTimeout(r, 1500));
  }

  return { counts, contexts };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runSentimentContexts({ force = false, root = process.cwd() } = {}) {
  await loadPipelineEnv({ root });

  const threadsPath  = join(root, THREADS_FILE);
  const artifactPath = join(root, ARTIFACT_FILE);

  if (!existsSync(threadsPath)) {
    throw new Error(`community-threads.json not found at ${threadsPath}`);
  }

  // Check if already fresh
  if (!force && existsSync(artifactPath)) {
    const existing = JSON.parse(readFileSync(artifactPath, "utf8"));
    const threadsData = JSON.parse(readFileSync(threadsPath, "utf8"));
    if (existing.meta?.sourceGeneratedAt === threadsData.meta?.generatedAt) {
      console.log("[sentiment-contexts] Already up to date. Use --force to regenerate.");
      return existing;
    }
  }

  const threadsArtifact = JSON.parse(readFileSync(threadsPath, "utf8"));
  // Only use threads that have been classified by classify-sentiment.mjs
  // (communitysentimentAt, not classifiedAt from the intent classifier)
  // Also apply XPAT relevance filter to remove off-topic posts
  const allThreads = (threadsArtifact.data.threads ?? [])
    .filter(t => t.communitysentimentAt)
    .filter(t => isXpatRelevant(t));

  const totalThreads = (threadsArtifact.data.threads ?? []).filter(t => t.communitysentimentAt).length;
  console.log(`[sentiment-contexts] ${allThreads.length} relevant threads (${totalThreads - allThreads.length} filtered as irrelevant)`);

  // ---------------------------------------------------------------------------
  // Build contexts for each time window × each company
  // ---------------------------------------------------------------------------

  const TIME_WINDOWS = ["3months", "1year", "all"];
  const byWindow = {};

  for (const window of TIME_WINDOWS) {
    const windowThreads = filterByTime(allThreads, window);
    console.log(`\n[sentiment-contexts] Window: ${window} — ${windowThreads.length} threads`);
    byWindow[window] = { overall: null, byCompany: {} };

    // Overall
    console.log(`  Generating overall sentiment...`);
    byWindow[window].overall = await generateContexts(windowThreads, "overall");

    // Per company
    for (const company of COMPANIES) {
      const companyThreads = windowThreads.filter(t => threadMentionsCompany(t, company));
      console.log(`  [${company}] ${companyThreads.length} threads`);
      if (companyThreads.length >= 2) {
        byWindow[window].byCompany[company] = await generateContexts(companyThreads, company, company);
      } else {
        byWindow[window].byCompany[company] = {
          counts: { positive: 0, negative: 0, neutral: 0, total: companyThreads.length },
          contexts: { positive: [], negative: [] },
        };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build artifact
  // ---------------------------------------------------------------------------

  const artifact = {
    meta: {
      caveats: [
        "Each theme represents patterns across multiple posts, not a single post.",
        "Neutral posts are counted but not themed.",
        "Per-company themes only include threads that mention that company.",
        "XPAT includes Remit2Any (former name) mentions.",
        "Source: community-threads.json — US↔India money transfer discussions.",
        "Themes generated by Claude Haiku from classified Reddit threads.",
      ],
      family: "community-sentiment-contexts",
      generatedAt: new Date().toISOString(),
      method: "Haiku identifies 3-5 recurring themes per sentiment group, per company, per time window.",
      provenance: "derived",
      source: "community-threads",
      sourceGeneratedAt: threadsArtifact.meta?.generatedAt,
      companies: COMPANIES,
      timeWindows: TIME_WINDOWS,
      version: 2,
    },
    data: byWindow,
  };

  await writeDeterministicJson(artifactPath, artifact);
  console.log(`\n[sentiment-contexts] Done → ${artifactPath}`);
  return artifact;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedPath = process.argv[1]
  ? new URL(`file://${process.argv[1]}`).pathname
  : "";

if (invokedPath === new URL(import.meta.url).pathname) {
  const force = process.argv.includes("--force");
  await runSentimentContexts({ force });
}
