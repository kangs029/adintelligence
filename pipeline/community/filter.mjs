/**
 * Pre-classification filter for community threads.
 *
 * Runs BEFORE Step 2 (classify) to drop posts that are clearly not relevant
 * to XPAT's market (US-based NRIs sending money to India).
 *
 * Filter logic — keep a post if ANY ONE of these is true:
 *   A) Post contains US-context signals (H-1B, US, America, USD, Green Card etc.)
 *   B) Post is from a US-diaspora subreddit (r/h1b, r/ABCDesis) — inherently US audience
 *
 * Drop a post only if ALL of these are true:
 *   - No US-context signals found in title or body
 *   - Not from a US-diaspora subreddit
 *   - Has clear inbound signals (India→US, sending from India etc.)
 *
 * We do NOT filter on engagement (score / numComments) —
 * a zero-engagement post can still be a valid signal.
 *
 * Exported for use in threads.mjs and testable independently.
 */

// ---------------------------------------------------------------------------
// Subreddits that are inherently US-diaspora — always pass filter
// ---------------------------------------------------------------------------

const US_DIASPORA_SUBREDDITS = new Set([
  "h1b",
  "abcdesis",     // r/ABCDesis (American-born/raised South Asians)
  "immigration",  // US immigration community
]);

// ---------------------------------------------------------------------------
// US-context signal patterns
// Match any of these in title + body → post is considered US-context
// ---------------------------------------------------------------------------

const US_CONTEXT_PATTERNS = [
  /\bh[-\s]?1b\b/iu,                          // H-1B, H1B, H 1B
  /\bh[-\s]?4\b/iu,                            // H-4 visa (H-1B dependent)
  /\bl[-\s]?1\b/iu,                            // L-1 visa
  /\bgreen\s*card\b/iu,                        // Green Card
  /\bopt\b|\bcpt\b/iu,                         // OPT / CPT (student work auth)
  /\b(us|u\.s\.)\s+(bank|dollar|tax|irs|ssn|citizen|resident|person|nri|expat)\b/iu,
  /\bfrom\s+(the\s+)?(us|usa|united\s+states|america|states)\b/iu,
  /\bin\s+(the\s+)?(us|usa|united\s+states|america|states)\b/iu,
  /\b(us|usa|united\s+states|america)\s+to\s+india\b/iu,
  /\busd\b|\bu\.s\.\s*dollar/iu,               // USD / U.S. dollar
  /\bamer[ik]a[n]?\b/iu,                       // America / American
  /\bstate[s]?\s+side\b/iu,                    // stateside
  /\bnri\s+(in|from|living|based|here|at)\b/iu, // NRI in/from/living [the US]
  /\b(silicon\s*valley|bay\s*area|new\s*jersey|new\s*york|texas|california|seattle|chicago)\b/iu,
];

// ---------------------------------------------------------------------------
// Inbound signals — India→non-US country transfers only
// Only used to DROP posts that have no US context AND are clearly
// about India→UK/Canada/Australia/UAE/Gulf corridors (not XPAT's market)
// India→US is kept — it is relevant to XPAT's corridor
// ---------------------------------------------------------------------------

const INBOUND_NON_US_PATTERNS = [
  /\bindia\s+to\s+(uk|united\s+kingdom|canada|australia|uae|dubai|gulf|singapore|germany|france|europe)\b/iu,
  /\b(send|transfer|remit)\s+(money|funds|rupees|inr)\s+(from\s+india\s+to|to)\s+(uk|canada|australia|uae|dubai|gulf)\b/iu,
  /\boutward\s+remittance\s+from\s+india\s+to\s+(uk|canada|australia|uae|gulf)\b/iu,
  /\brepatriate\s+(funds?\s+)?(from\s+)?india\s+to\s+(uk|canada|australia|uae|gulf)\b/iu,
  // LRS and FEMA are India-specific outward remittance regulations —
  // relevant only when the destination is NOT the US
  // Keep LRS/FEMA posts that also mention US context (handled by Rule A/B)
];

// ---------------------------------------------------------------------------
// Core filter function
// ---------------------------------------------------------------------------

/**
 * Returns true if the thread should be kept for classification.
 *
 * Keep if ANY ONE of these is true:
 *   A) From a US-diaspora subreddit (r/h1b, r/ABCDesis, r/immigration)
 *   B) Contains US-context signals (H-1B, USD, Green Card, "in the US" etc.)
 *   C) About India→US transfers (relevant to XPAT's corridor)
 *
 * Drop only if ALL of these are true:
 *   - No US-context signals
 *   - Not from a US-diaspora subreddit
 *   - Clearly about India→UK/Canada/Australia/UAE/Gulf (not XPAT's market)
 *
 * @param {object} thread - A normalised community thread record
 * @returns {{ keep: boolean, reason: string }}
 */
export function shouldKeepThread(thread) {
  const subredditLower = (thread.subreddit ?? "").toLowerCase();

  // Rule A — US-diaspora subreddit: always keep
  if (US_DIASPORA_SUBREDDITS.has(subredditLower)) {
    return { keep: true, reason: "us_diaspora_subreddit" };
  }

  const text = `${thread.title ?? ""} ${thread.body ?? ""}`;

  // Rule B — US-context signals in text: always keep
  const hasUsContext = US_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
  if (hasUsContext) {
    return { keep: true, reason: "us_context_signal" };
  }

  // Rule C — India→non-US corridor with no US context: drop
  const hasNonUsInbound = INBOUND_NON_US_PATTERNS.some((pattern) => pattern.test(text));
  if (hasNonUsInbound) {
    return { keep: false, reason: "non_us_corridor" };
  }

  // No US context, no non-US inbound signal — keep and let Haiku classify
  return { keep: true, reason: "direction_unclear_keep" };
}

// ---------------------------------------------------------------------------
// Batch filter
// ---------------------------------------------------------------------------

/**
 * Filters an array of threads, returning only those that pass shouldKeepThread.
 * Also returns a summary of how many were dropped and why.
 *
 * @param {object[]} threads
 * @returns {{ threads: object[], dropped: number, summary: object }}
 */
export function filterThreads(threads) {
  const kept = [];
  const droppedReasons = {};

  for (const thread of threads) {
    const { keep, reason } = shouldKeepThread(thread);
    if (keep) {
      kept.push(thread);
    } else {
      droppedReasons[reason] = (droppedReasons[reason] ?? 0) + 1;
    }
  }

  const dropped = threads.length - kept.length;

  return {
    threads: kept,
    dropped,
    summary: droppedReasons,
  };
}
