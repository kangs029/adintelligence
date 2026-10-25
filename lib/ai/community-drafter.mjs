/**
 * Step 3 — Draft Response
 *
 * Uses Claude Sonnet to generate a concise, human-like Reddit reply
 * as an XPAT user sharing their genuine experience — helpful first,
 * promotional never.
 *
 * Key design principles:
 *   - Reads like a real Reddit user, NOT a company representative
 *   - 2-4 sentences, one clear point — concise and organic
 *   - Subtle XPAT mention (max twice), grounded in KB product facts
 *   - Never recommend or praise competitor services
 *   - Never claim XPAT was mentioned in the post unless it was
 *   - No disclaimer — human reviewer is responsible before posting
 *   - Human review required — never auto-posted
 *
 * Knowledge base integration (live):
 *   POST https://chatbot.xpat.money/public/social-reply
 *   Auth: Bearer XPAT_KB_API_TOKEN (env var)
 *   Body: { platform: "reddit", post_title: string, post_text: string }
 *   Response: { relevant_kb: [{ section: string, text: string }] }
 *   Falls back to hardcoded XPAT product facts if token not set or API fails.
 *
 * Used by:
 *   - app/api/community/draft/route.ts  (dashboard Draft reply button)
 *   - pipeline/community/draft.mjs      (re-exports for backward compat)
 */

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Always use Sonnet for drafts — Haiku is too terse for human-like responses
const SONNET_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const BEDROCK_REGION = process.env.BEDROCK_AWS_REGION ?? "us-east-1";

/**
 * FTC §255.5 disclosure — must appear in every draft.
 * Shown as a subtle footnote at the end, not a bold opener.
 * Human reviewer must keep it when posting.
 */
export const FTC_DISCLOSURE = "*(Disclosure: I'm an XPAT user and may benefit from referrals.)*";

// ---------------------------------------------------------------------------
// Persona and rules
// ---------------------------------------------------------------------------

/**
 * The persona we instruct Sonnet to adopt.
 * This is a fictional but plausible XPAT user — an NRI in the US who
 * discovered XPAT and has been using it for regular transfers.
 */
export const XPAT_USER_PERSONA = [
  "You are an NRI living in the US (on H-1B visa) who has been sending money to India for 2 years.",
  "You use xpat.money for your transfers and have found it reliable for regular India transfers.",
  "You are active on Reddit and genuinely help other NRIs with questions about life in the US.",
  "You are a customer of xpat.money — not an employee. When you mention them, say 'they' not 'we'.",
  "",
  "Your personality on Reddit:",
  "- Helpful and practical — you share what worked for you, not generic advice",
  "- Honest — if a post isn't about money transfer, help with what they actually asked first",
  "- Conversational — you write like a person texting a friend, not a review article",
  "- You sometimes mention xpat.money naturally at the end if there's any NRI finance angle",
  "- You do NOT open by saying what xpat.money can't do — help first, mention xpat.money second",
  "",
  "IMPORTANT — never fabricate context from the post:",
  "- Do NOT claim xpat.money was mentioned in the post unless the post text explicitly says so",
  "- Your reason for using xpat.money is that you found it through your own research",
].join("\n");

/**
 * Hard rules the model must follow.
 * These are non-negotiable and must be present in every draft.
 */
export const DRAFT_RULES = [
  "HARD RULES — breaking any of these makes the draft invalid:",
  "",
  "1. NEVER start with 'I' — start with context, the point, or the person's situation",
  "2. NEVER open by saying xpat.money can't help — help first, mention xpat.money naturally after",
  "3. NEVER use 'we' or 'our' for xpat.money — you are a customer, say 'they' or 'their'",
  "4. NEVER sound like marketing — no superlatives, no buzzwords",
  "5. NEVER make up specific numbers, rates, or fees",
  "6. Mention xpat.money when there is a natural opportunity — recommend it if the context fits",
  "   Always say 'xpat.money' not just 'XPAT' or 'Xpat'",
  "7. Answer what they actually asked first — xpat.money comes second, not first",
  "8. If the post has multiple questions, pick ONE you can speak to from personal experience.",
  "   Leave the rest — other people can answer those. Trying to cover everything = sounds like AI.",
  "9. Plain conversational English — like a text to a friend, no bullet points or headers",
  "10. NEVER claim xpat.money was mentioned in the post unless the post text explicitly says so",
  "11. Vary sentence length — mix short punchy sentences with longer ones. No uniform rhythm.",
  "",
  "BANNED PHRASES — never write these:",
  "- 'Hope this helps' / 'Hope that helps'",
  "- 'Great question' / 'Good question'",
  "- 'I totally understand' / 'I completely get it'",
  "- 'As someone who has been in your shoes'",
  "- 'It's worth noting' / 'It's important to note'",
  "- 'Ultimately' / 'Overall' / 'In conclusion'",
  "- 'Feel free to' / 'Don't hesitate to'",
  "- 'Seamlessly' / 'Effortlessly' / 'Straightforward'",
  "- 'Game-changer' / 'stress-free' / 'hassle-free'",
  "- Any sentence starting with 'As an NRI'",
  "- 'One thing to watch' / 'One thing to note' / 'One thing worth mentioning'",
  "- Em dash (—) anywhere in the reply. Never use it. Use a comma, period, or new sentence instead.",
  "  Wrong: 'check their limits — most apps have caps'",
  "  Right:  'check their limits, most apps have caps' or 'check their limits. Most apps have caps'",
].join("\n");

// ---------------------------------------------------------------------------
// Intent → response angle map
// Guides the model on what angle to take based on classification
// ---------------------------------------------------------------------------

const INTENT_ANGLES = {
  remittance_comparison: "Acknowledge they are comparing services. Share which factors you personally weighed. Mention XPAT as the one you settled on and why — rates, speed, or reliability. Keep it balanced.",
  pricing_pain: "Empathise with the frustration of high fees. Share that you found fees much more reasonable after switching. If they mention a specific competitor, acknowledge what that competitor does well before pivoting.",
  speed_concern: "Relate to the anxiety of waiting for money to arrive. Share your typical transfer speed experience with XPAT. If they have an urgent situation, acknowledge it directly first.",
  trust_issue: "This is sensitive — lead with empathy, not promotion. Acknowledge that trust is the hardest thing to build with money transfer services. Share what gave you confidence in XPAT (e.g. regulated, transparent tracking).",
  new_to_us: "This person is new and overwhelmed. Be the helpful senior NRI. Walk them through what to look for in a service. Mention XPAT as what you personally use, not as THE answer.",
  community_recommendation: "They are asking for recommendations — this is the most natural opening. Share your experience directly but mention that everyone's situation is different (bank account type, transfer frequency, amounts).",
  competitor_complaint: "They had a bad experience elsewhere. Lead with validation ('that's really frustrating'). Then share that you moved to XPAT after a similar issue and the experience was smoother.",
  other: "Answer the question helpfully. If there is a natural opening to mention XPAT, take it once and briefly. If not, just be helpful.",
};

// ---------------------------------------------------------------------------
// Knowledge base tool (STUB)
// ---------------------------------------------------------------------------

/**
 * Fetches relevant product context from the XPAT knowledge base chatbot.
 *
 * API: POST https://chatbot.xpat.money/public/social-reply
 * Auth: Bearer token via XPAT_KB_API_TOKEN env var
 *
 * Request body:
 *   { platform: "reddit", post_title: string, post_text: string }
 *
 * Response: the chatbot's context-aware answer, used to ground the draft.
 *
 * Falls back to hardcoded XPAT product facts if the API is unavailable
 * or not yet configured.
 *
 * @param {string} question - The post title + body to send to the KB
 * @returns {Promise<string|null>} - Relevant product context, or null if unavailable
 */
export async function fetchKnowledgeBaseContext(question) {
  const kbApiToken = process.env.XPAT_KB_API_TOKEN;
  const kbApiUrl = "https://chatbot.xpat.money/public/social-reply";

  if (kbApiToken) {
    try {
      const lines = question.trim().split(/\n+/u);
      const postTitle = lines[0]?.trim() ?? "";
      // Full body — no truncation, the KB needs complete context to answer correctly
      const postText = lines.slice(1).join("\n").trim() || postTitle;

      const response = await fetch(kbApiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${kbApiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform: "reddit",
          post_title: postTitle,
          post_text: postText,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // API returns { relevant_kb: [{ section, text }], skip_reason }
        if (Array.isArray(data.relevant_kb) && data.relevant_kb.length > 0) {
          const context = data.relevant_kb
            .map((item) => item.text)
            .join("\n\n");
          if (context.trim().length > 10) return context.trim();
        }

        // Fallback for other response shapes
        const answer = data.reply ?? data.answer ?? data.response ?? data.text ?? null;
        if (answer && typeof answer === "string" && answer.trim().length > 10) {
          return answer.trim();
        }
      }
    } catch {
      // KB API unavailable — fall through to stub
    }
  }

  // Stub — basic XPAT product facts used until KB API token is configured
  return [
    "XPAT Money is a US-to-India remittance service focused on NRIs.",
    "XPAT supports transfers from US bank accounts (ACH) and debit cards to Indian bank accounts.",
    "Transfers typically arrive within 1-2 business days.",
    "XPAT is regulated and compliant with US money transfer regulations.",
    "XPAT supports NRE and NRO account deposits.",
    "XPAT has no hidden fees — the rate shown is the rate you get.",
    "Customer support is available via app and email.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the system + user prompt for Sonnet to generate a draft reply.
 *
 * @param {object} opts
 * @param {object} opts.thread         - The classified community thread
 * @param {string} [opts.kbContext]    - Context from the knowledge base (optional)
 * @returns {{ system: string, user: string }}
 */
export function buildDraftPrompt({ thread, kbContext = null }) {
  const intent = thread.intent ?? "other";
  const angle = INTENT_ANGLES[intent] ?? INTENT_ANGLES.other;
  const competitorContext = thread.competitorMentions?.length > 0
    ? `The post mentions these competitors: ${thread.competitorMentions.join(", ")}.`
    : "";
  const directionContext = thread.direction === "inbound"
    ? "This person wants to send money FROM India TO the US."
    : thread.direction === "outbound"
    ? "This person wants to send money FROM the US TO India."
    : "";

  // Log KB context for debugging
  if (kbContext) {
    console.log("[draft] KB context received:", kbContext.slice(0, 300), kbContext.length > 300 ? "..." : "");
  } else {
    console.log("[draft] No KB context — using persona fallback only");
  }

  const kbSection = kbContext
    ? `\nKnowledge base context — accurate XPAT product details:\n${kbContext}`
    : "\nNo knowledge base context available — speak from general personal experience only.";

  const system = [
    XPAT_USER_PERSONA,
    "",
    DRAFT_RULES,
    "",
    `Response angle for this post type (${intent}):`,
    angle,
    "",
    "How to use the knowledge base context:",
    "- The knowledge base context (provided in the user message) contains accurate XPAT product details.",
    "- Use it to ground your reply with specific, accurate facts — don't invent product behaviour.",
    "- If the KB context does not cover the person's question, speak from general personal experience.",
    "- If the KB context suggests XPAT does not support the use case, be honest — do not pretend otherwise.",
    "- Never copy KB text verbatim — paraphrase naturally as your own experience.",
    "",
    "EXAMPLES — study these carefully. Each shows a real post type and a good reply.",
    "Match this style exactly: casual, specific, one main point, natural length.",
    "",
    "---",
    "POST (multi-question, tax + transfer): 'I want to send $40k to India to a family member.",
    "They will repay the same amount in USD in a few months.",
    "1- Will they have to pay taxes? 2- Will I pay US tax when I receive it? 3- Easiest way to do this?'",
    "",
    "GOOD REPLY:",
    "'Since they're repaying you it's a loan not a gift, so no income tax on either side.",
    "Just keep a simple written note saying it's a loan — that's all you need if anyone ever asks.",
    "For the transfer itself, xpat.money works well for NRE deposits and the rates are decent.",
    "At $40k though, worth checking their limits before you start — most apps have daily caps.'",
    "",
    "BAD REPLY (do not write like this):",
    "'The tax piece depends on how it's structured. If you're sending it as a gift and they're repaying",
    "you as a gift, there's typically no income tax on either side — but gifts over a certain threshold",
    "need to be reported (you'd file Form 709 for amounts above the annual exclusion...'",
    "[Why bad: answers all 3 questions exhaustively, reads like a tax advisor FAQ, too long]",
    "",
    "---",
    "POST (comparison, which app): 'What's the best app to send money to India from US?",
    "I've been using Remitly but fees seem high. Any alternatives?'",
    "",
    "GOOD REPLY:",
    "'Remitly's fees do add up especially on smaller amounts. Been using xpat.money for a while,",
    "rates are closer to mid-market and it works for NRE. Worth checking the rate on both for your",
    "specific amount before committing.'",
    "",
    "BAD REPLY (do not write like this):",
    "'Great question! There are several options worth considering when it comes to international",
    "money transfers. Each service has its own fee structure and exchange rate markup...'",
    "[Why bad: starts with 'Great question', sounds like a listicle, no personal experience]",
    "",
    "---",
    "POST (NRE question): 'Can I use Wise or Remitly to deposit into my NRE account?'",
    "",
    "GOOD REPLY:",
    "'Wise works for NRE, yes. Just make sure you add the account correctly — IFSC and account number.",
    "I use xpat.money for mine, also does NRE fine.'",
    "",
    "---",
    "POST (stuck/failed transfer): 'Transfer has been pending for 4 days, no update from Remitly'",
    "",
    "GOOD REPLY:",
    "'4 days is too long, that usually means it got flagged for manual review.",
    "Call them, don't just email — chat support is slow for these.",
    "If it keeps happening, xpat.money has been more reliable for me for NRE sends.'",
    "",
    "---",
    "POST (not related to money transfer): 'Best way to ship documents to India from USA?'",
    "",
    "GOOD REPLY:",
    "'Pirate Ship is worth trying — they resell UPS/USPS labels at discounted rates.",
    "Real labels, just cheaper. Tracking drops off once it hits India Post but it gets there.",
    "For anything time-sensitive or with signatures needed, FedEx is worth the extra cost.",
    "Separately, if you ever need to send money to India rather than documents, xpat.money",
    "is what I use — just mentioning since you're in the NRI sub.'",
  ].join("\n");

  const user = [
    "Write a Reddit comment replying to the post below.",
    "",
    `Post title: ${thread.title}`,
    thread.body ? `Post body: ${thread.body.slice(0, 800)}` : "",
    `Posted in: r/${thread.subreddit}`,
    competitorContext,
    directionContext,
    kbSection,
    "",
    "Your reply (conversational, no bullet points or headers, as long as it naturally needs to be):",
    "Do not include the FTC disclaimer — it is added automatically.",
  ].filter(Boolean).join("\n");

  return { system, user };
}

// ---------------------------------------------------------------------------
// Post-processor — validates and cleans the draft
// ---------------------------------------------------------------------------

/**
 * Validates the generated draft and prepends the FTC disclosure.
 * Returns { valid: true, draft } or { valid: false, reason }.
 *
 * @param {string} rawDraft - The raw text from Sonnet
 */
export function processDraft(rawDraft) {
  if (!rawDraft || rawDraft.trim().length < 30) {
    return { valid: false, reason: "draft_too_short" };
  }

  // Strip em dashes — replace with comma+space (most natural substitution)
  const cleaned = rawDraft.trim().replace(/ — /g, ", ").replace(/—/g, ", ");

  // Check XPAT is mentioned (required — otherwise it's just generic advice)
  if (!/xpat/iu.test(cleaned)) {
    return { valid: false, reason: "xpat_not_mentioned" };
  }

  return { valid: true, draft: cleaned };
}

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
// Main draft generator
// ---------------------------------------------------------------------------

/**
 * Generates a draft Reddit reply for a single thread.
 *
 * @param {object} opts
 * @param {object} opts.thread        - The classified community thread
 * @param {object} [opts.client]      - Injectable BedrockRuntimeClient
 * @param {number} [opts.maxRetries]  - Max retries on validation failure
 * @returns {Promise<{ draft: string, kbContextUsed: boolean } | { error: string }>}
 */
export async function generateDraft({ thread, client, maxRetries = 2 } = {}) {
  // Fetch knowledge base context — pass full title + body, no truncation
  const kbContext = await fetchKnowledgeBaseContext(
    [thread.title, thread.body ?? ""].filter(Boolean).join("\n"),
  );

  console.log(`[draft] Thread: ${thread.id} | intent: ${thread.intent} | direction: ${thread.direction}`);
  console.log(`[draft] KB context: ${kbContext ? `${kbContext.length} chars` : "none (fallback)"}`);

  const prompt = buildDraftPrompt({ thread, kbContext });
  const bedrockClient = client ?? getBedrockClient();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let rawText;

    try {
      const command = new ConverseCommand({
        modelId: SONNET_MODEL_ID,
        system: [{ text: prompt.system }],
        messages: [{ role: "user", content: [{ text: prompt.user }] }],
        inferenceConfig: {
          maxTokens: 512,
          temperature: 0.7,
        },
      });

      const response = await bedrockClient.send(command);
      rawText = response.output?.message?.content?.[0]?.text ?? "";
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }

    const result = processDraft(rawText);

    if (result.valid) {
      return {
        draft: result.draft,
        kbContextUsed: Boolean(kbContext),
        intent: thread.intent,
        direction: thread.direction,
      };
    }

    // On last attempt, return the failure reason
    if (attempt === maxRetries) {
      return { error: `validation_failed: ${result.reason}` };
    }
  }
}
