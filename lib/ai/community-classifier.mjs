/**
 * Community Intelligence — Classifier AI logic
 *
 * Contains all AI-related logic for classifying Reddit threads:
 *   - Classification taxonomy constants
 *   - Bedrock Claude Haiku prompt builder
 *   - LLM invocation with retry/throttle handling
 *   - Response parser and validator
 *   - Single-thread classifier
 *
 * Used by:
 *   - pipeline/community/classify.mjs  (batch pipeline runner)
 *
 * Keeping AI logic here (lib/ai/) separates it from pipeline orchestration
 * and makes it reusable from API routes or other agents.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Claude Haiku 4.5 via cross-region inference profile
const HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const BEDROCK_REGION = process.env.BEDROCK_AWS_REGION ?? "us-east-1";

// Kept for backward compatibility with existing classified threads that still have relevanceScore
export const RELEVANCE_RESPOND_THRESHOLD = 0.7;
export const RELEVANCE_DISCARD_THRESHOLD = 0.4;

export const INTENT_VALUES = [
  "remittance_comparison",
  "pricing_pain",
  "speed_concern",
  "trust_issue",
  "new_to_us",
  "community_recommendation",
  "competitor_complaint",
  "other",
];

export const SENTIMENT_VALUES = ["positive", "neutral", "negative"];
export const URGENCY_VALUES = ["high", "medium", "low"];
export const DIRECTION_VALUES = ["outbound", "inbound", "both", "unclear"];
export const LANGUAGE_VALUES = ["English", "Hindi", "Telugu", "Tamil", "other"];
export const USE_CASE_VALUES = ["first_transfer", "repeat", "kyc", "rate_shopping", "other"];

const COMPETITOR_ALIASES = {
  wise: "Wise",
  transferwise: "Wise",
  remitly: "Remitly",
  xoom: "Xoom",
  "western union": "Western Union",
  wu: "Western Union",
  paypal: "PayPal",
  moneygram: "MoneyGram",
  aspora: "Aspora",
  crobo: "Crobo",
};

// ---------------------------------------------------------------------------
// Bedrock client
// ---------------------------------------------------------------------------

let _client = null;

function getBedrockClient() {
  if (_client) return _client;

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
// Prompt builder
// ---------------------------------------------------------------------------

export function buildClassifyPrompt(thread) {
  const text = [thread.title, thread.body ?? ""].filter(Boolean).join("\n\n").slice(0, 3000);
  const meta = `subreddit: r/${thread.subreddit} | upvotes: ${thread.score} | comments: ${thread.numComments}`;

  return {
    system: [
      "You are a community intelligence classifier for XPAT Money, a US-India remittance service.",
      "You classify Reddit posts to determine if they are relevant to XPAT's community engagement.",
      "",
      "XPAT is a remittance app for people in the US — NRIs, H1B/OPT visa holders, US citizens —",
      "who want to send money to India or receive money from India into a US bank account.",
      "XPAT competes with Wise, Remitly, Xoom, Western Union, PayPal, MoneyGram, Aspora, and Crobo.",
      "",
      "Respond with a single valid JSON object — no markdown, no explanation, no wrapper text.",
      "Required fields:",
      "  isRelevant      boolean — true or false (see criteria below)",
      "  intent          string  — one of: remittance_comparison | pricing_pain | speed_concern | trust_issue | new_to_us | community_recommendation | competitor_complaint | other",
      "  sentiment       string  — one of: positive | neutral | negative",
      "  urgency         string  — one of: high | medium | low",
      "  direction       string  — one of: outbound | inbound | both | unclear",
      "                            outbound = US→India (person in US sending to India)",
      "                            inbound  = India→US (person in India sending to US)",
      "                            both     = post discusses both directions",
      "                            unclear  = direction cannot be determined",
      "  competitorMentions  array of strings  — normalised competitor names found in the text (empty array if none)",
      "  language        string  — one of: English | Hindi | Telugu | Tamil | other",
      "  useCase         string  — one of: first_transfer | repeat | kyc | rate_shopping | other",
      "",
      "isRelevant criteria — set true ONLY if the post matches at least one of these:",
      "  • Person in the US (NRI, H1B, OPT, green card, US citizen) sending money to India",
      "  • Person sending money from India to a US bank account",
      "  • Comparing or asking about remittance services (Wise, Remitly, Xoom, Taptap, etc) for India corridor",
      "  • Questions or complaints about USD→INR or INR→USD transfer fees, exchange rates, or hidden charges",
      "  • NRE, NRO, or FCNR account transfers between US and India",
      "  • Transfer stuck, failed, delayed, or missing for US↔India corridor",
      "  • Sending money to parents or family in India from the US",
      "  • Best way or cheapest way to send money to India from the US",
      "  • US to India remittance tax, TCS, or regulatory questions",
      "If none of the above apply, set isRelevant to false.",
    ].join("\n"),

    user: [`Post metadata: ${meta}`, "", "Post text:", text].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// LLM invocation
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invokeHaiku({ prompt, client, retryDelayMs = 5000 }) {
  const bedrockClient = client ?? getBedrockClient();

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 512,
    temperature: 0,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const command = new InvokeModelCommand({
    modelId: HAIKU_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrockClient.send(command);
      const decoded = new TextDecoder().decode(response.body);
      const parsed = JSON.parse(decoded);
      return parsed?.content?.[0]?.text ?? "";
    } catch (error) {
      lastError = error;
      const isThrottle =
        error?.name === "ThrottlingException" ||
        String(error?.message ?? "").toLowerCase().includes("too many requests") ||
        String(error?.message ?? "").toLowerCase().includes("throttl");

      if (isThrottle && attempt < MAX_RETRIES) {
        const wait = retryDelayMs * (attempt + 1);
        console.warn(`[classify] throttled, retrying in ${wait / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Parse & validate LLM response
// ---------------------------------------------------------------------------

function normaliseCompetitors(mentions) {
  if (!Array.isArray(mentions)) return [];
  const seen = new Set();
  const result = [];
  for (const mention of mentions) {
    const key = String(mention).toLowerCase().trim();
    const normalised = COMPETITOR_ALIASES[key] ?? mention;
    if (!seen.has(normalised)) {
      seen.add(normalised);
      result.push(normalised);
    }
  }
  return result.sort();
}

export function parseClassification(rawText) {
  let parsed;
  try {
    const clean = rawText.replace(/^```json\s*/u, "").replace(/\s*```$/u, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return undefined;
  }

  const intent = INTENT_VALUES.includes(parsed.intent) ? parsed.intent : "other";
  const sentiment = SENTIMENT_VALUES.includes(parsed.sentiment) ? parsed.sentiment : "neutral";
  const urgency = URGENCY_VALUES.includes(parsed.urgency) ? parsed.urgency : "low";
  const direction = DIRECTION_VALUES.includes(parsed.direction) ? parsed.direction : "unclear";
  const language = LANGUAGE_VALUES.includes(parsed.language) ? parsed.language : "other";
  const useCase = USE_CASE_VALUES.includes(parsed.useCase) ? parsed.useCase : "other";

  // isRelevant — boolean, default false if missing or unparseable
  const isRelevant = parsed.isRelevant === true;

  return {
    competitorMentions: normaliseCompetitors(parsed.competitorMentions),
    direction,
    intent,
    isRelevant,
    language,
    sentiment,
    urgency,
    useCase,
  };
}

// ---------------------------------------------------------------------------
// Single-thread classifier
// ---------------------------------------------------------------------------

export async function classifyThread({ thread, client, retryDelayMs }) {
  const prompt = buildClassifyPrompt(thread);

  let rawText;
  try {
    rawText = await invokeHaiku({ prompt, client, retryDelayMs });
  } catch (error) {
    return { ...thread, classifyError: String(error?.message ?? error) };
  }

  const classification = parseClassification(rawText);
  if (!classification) {
    return { ...thread, classifyError: `parse_failed: ${rawText.slice(0, 200)}` };
  }

  return { ...thread, ...classification, classifiedAt: new Date().toISOString() };
}
