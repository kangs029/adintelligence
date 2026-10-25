/**
 * Xpat relevance filter — dry run
 * Applies Xpat-specific criteria to community-threads.json
 * and prints pass/fail for each thread WITHOUT modifying any files.
 *
 * Usage: node pipeline/community/xpat-relevance-filter.mjs
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACT = join("data", "artifacts", "community-threads.json");
const threads = JSON.parse(readFileSync(ARTIFACT, "utf8")).data.threads;

// ---------------------------------------------------------------------------
// XPAT RELEVANCE CRITERIA
// A post passes if it matches ANY rule in ANY category below.
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

// 2. NRE/NRO/FCNR banking in transfer context
const BANKING_PATTERNS = [
  /\bnre\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bnro\b.{0,40}(transfer|account|usa|us\b|send|remit)/i,
  /\bfcnr\b/i,
  /(transfer|send|remit).{0,40}\bnre\b/i,
  /(transfer|send|remit).{0,40}\bnro\b/i,
];

// 3. Competitor mentions in India transfer context
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

// 4. Pain points Xpat solves
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

// 5. Contextual NRI+US finance
const CONTEXT_PATTERNS = [
  /nri.{0,30}(send|transfer|remit|money|fund)/i,
  /(send|transfer|remit|money|fund).{0,30}nri/i,
  /h1b.{0,30}(send|transfer|remit|money|india)/i,
  /401k.{0,30}india/i,
  /india.{0,30}401k/i,
  /us.{0,10}india.{0,10}remittance/i,
  /remittance.{0,20}(us|usa|h1b|nri)/i,
];

// ---------------------------------------------------------------------------
// EXCLUSION — hard drop regardless of above matches
// ---------------------------------------------------------------------------
const EXCLUDE_PATTERNS = [
  /h1b.{0,30}(transfer|stamp|petition|lottery|extension|cos|uscis|approval|denial)/i,
  /visa.{0,20}(stamp|interview|petition|approve|deni)/i,
  /oci\b(?!.{0,30}(money|transfer|remit|send|fund))/i,
  /passport.{0,20}(renew|expire|lost|appoint)/i,
  /\b(cricket|ipl|bollywood|movie|film|music)\b/i,
  /\b(election|bjp|congress|modi|politics|vote)\b/i,
  /\b(covid|cancer|hospital|medical|disease)\b(?!.{0,30}(money|fund|transfer))/i,
  /india.{0,20}(uk|canada|australia|uae|gulf|dubai|singapore|germany).{0,20}(transfer|remit|send)/i,
];

// ---------------------------------------------------------------------------
// Filter function
// ---------------------------------------------------------------------------
function isXpatRelevant(thread) {
  const text = `${thread.title ?? ""} ${thread.body ?? ""}`;

  // Hard exclusions first
  for (const p of EXCLUDE_PATTERNS) {
    if (p.test(text)) return { pass: false, reason: `excluded: ${p.source.slice(0, 40)}` };
  }

  // Check all inclusion categories
  if (CORRIDOR_PATTERNS.some(p => p.test(text))) return { pass: true, reason: "corridor" };
  if (BANKING_PATTERNS.some(p => p.test(text)))  return { pass: true, reason: "banking" };
  if (COMPETITOR_PATTERNS.some(p => p.test(text))) return { pass: true, reason: "competitor" };
  if (PAIN_PATTERNS.some(p => p.test(text)))     return { pass: true, reason: "pain_point" };
  if (CONTEXT_PATTERNS.some(p => p.test(text)))  return { pass: true, reason: "nri_context" };

  return { pass: false, reason: "no_match" };
}

// ---------------------------------------------------------------------------
// Run and print results
// ---------------------------------------------------------------------------
const passing = [];
const failing = [];

for (const t of threads) {
  const { pass, reason } = isXpatRelevant(t);
  if (pass) passing.push({ t, reason });
  else failing.push({ t, reason });
}

console.log(`\n${"=".repeat(60)}`);
console.log(`XPAT RELEVANCE FILTER — DRY RUN`);
console.log(`${"=".repeat(60)}`);
console.log(`Total: ${threads.length} | Pass: ${passing.length} | Fail: ${failing.length}`);

console.log(`\n✅ PASSING (${passing.length})`);
for (const { t, reason } of passing) {
  console.log(`  [${reason.padEnd(12)}] r/${t.subreddit.padEnd(18)} | ${t.title.slice(0, 65)}`);
}

console.log(`\n❌ FAILING (${failing.length})`);
for (const { t, reason } of failing) {
  console.log(`  [${reason.padEnd(12)}] r/${t.subreddit.padEnd(18)} | ${t.title.slice(0, 65)}`);
}
