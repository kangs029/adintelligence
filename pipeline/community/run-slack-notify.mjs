/**
 * pipeline/community/run-slack-notify.mjs
 *
 * Finds recent actionable Reddit threads from community-threads.json,
 * calls the XPAT app's /api/community/draft endpoint to generate a real
 * AI draft reply for each, then sends them to Slack for human review.
 *
 * This is the daily pipeline runner — run it once a day (or on-demand)
 * after the community thread pipeline has refreshed community-threads.json.
 *
 * Usage:
 *   # Against local dev server (pnpm dev must be running):
 *   node --env-file=.env.local pipeline/community/run-slack-notify.mjs
 *
 *   # Against production:
 *   node --env-file=.env.local pipeline/community/run-slack-notify.mjs \
 *     --app-url https://xpat.money
 *
 *   # Limit how many threads to notify (default: 5):
 *   node --env-file=.env.local pipeline/community/run-slack-notify.mjs --limit 3
 *
 *   # Dry run — generate drafts but don't send to Slack:
 *   node --env-file=.env.local pipeline/community/run-slack-notify.mjs --dry-run
 *
 * Env vars:
 *   SLACK_WEBHOOK_URL  — Slack incoming webhook URL
 *   XPAT_APP_URL       — Base URL of the app (default: http://localhost:3000)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { notifySlackBatch } from "./notify-slack.mjs";

const THREADS_FILE = join("data", "artifacts", "community-threads.json");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const appUrlArg = args.indexOf("--app-url");
const APP_URL = appUrlArg !== -1
  ? args[appUrlArg + 1]
  : (process.env.XPAT_APP_URL ?? "http://localhost:3000");

const limitArg = args.indexOf("--limit");
const MAX_THREADS = limitArg !== -1 ? Number(args[limitArg + 1]) : 5;

// ---------------------------------------------------------------------------
// Load and filter threads
// ---------------------------------------------------------------------------

function loadRecentActionableThreads() {
  const artifact = JSON.parse(readFileSync(THREADS_FILE, "utf8"));
  const threads = artifact.data.threads ?? [];

  // Filter: recent threads that XPAT should reply to
  // Priority order: xpat-specific first, then high-relevance recent threads
  const actionable = threads.filter(t => {
    // Must be recent (not historical)
    if (t.recency !== "recent") return false;
    // Must have a real URL to post to
    if (!t.url && !t.permalink) return false;
    // Exclude threads with very low relevance
    if (typeof t.relevanceScore === "number" && t.relevanceScore < 0.5) return false;
    // Exclude already-archived or deleted posts
    if (t.status === "archived" || t.status === "deleted") return false;
    return true;
  });

  // Sort: xpat-specific first, then by score desc
  actionable.sort((a, b) => {
    if (a.xpatSpecific && !b.xpatSpecific) return -1;
    if (!a.xpatSpecific && b.xpatSpecific) return 1;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  return actionable.slice(0, MAX_THREADS);
}

// ---------------------------------------------------------------------------
// Call /api/community/draft for a single thread
// ---------------------------------------------------------------------------

async function generateDraftForThread(thread, appUrl) {
  const url = `${appUrl}/api/community/draft`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread }),
    });
  } catch (err) {
    return { ok: false, error: `Network error calling ${url}: ${err.message}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Draft API HTTP ${res.status}: ${body.slice(0, 200)}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Draft API returned non-JSON response" };
  }

  if (data.error) {
    return { ok: false, error: data.error };
  }

  if (!data.draft) {
    return { ok: false, error: "Draft API returned empty draft" };
  }

  return { ok: true, draft: data.draft, kbContextUsed: data.kbContextUsed ?? false };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  console.log(`[run-slack-notify] App URL: ${APP_URL}`);
  console.log(`[run-slack-notify] Max threads: ${MAX_THREADS}`);
  console.log(`[run-slack-notify] Dry run: ${DRY_RUN}`);
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.error("[run-slack-notify] SLACK_WEBHOOK_URL is not set in env. Aborting.");
    process.exit(1);
  }

  // 1. Load threads
  console.log("\n[run-slack-notify] Loading recent actionable threads...");
  let threads;
  try {
    threads = loadRecentActionableThreads();
  } catch (err) {
    console.error("[run-slack-notify] Failed to load community-threads.json:", err.message);
    process.exit(1);
  }

  if (threads.length === 0) {
    console.log("[run-slack-notify] No recent actionable threads found. Nothing to notify.");
    return;
  }

  console.log(`[run-slack-notify] Found ${threads.length} threads to process:`);
  for (const t of threads) {
    console.log(`  - [${t.id}] ${t.title?.slice(0, 70)} (r/${t.subreddit}, score: ${t.score ?? 0})`);
  }

  // 2. Generate AI drafts for each thread
  console.log(`\n[run-slack-notify] Generating AI drafts via ${APP_URL}/api/community/draft...`);
  const items = [];
  const draftErrors = [];

  for (const thread of threads) {
    process.stdout.write(`  [${thread.id}] Drafting... `);
    const result = await generateDraftForThread(thread, APP_URL);

    if (!result.ok) {
      console.log(`✗ ${result.error}`);
      draftErrors.push({ id: thread.id, error: result.error });
      continue;
    }

    console.log(`✓ ${result.kbContextUsed ? "(KB context used)" : "(fallback facts)"}`);
    items.push({ thread, draft: result.draft });

    // Small delay between Bedrock calls to avoid rate limits
    if (threads.indexOf(thread) < threads.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (items.length === 0) {
    console.log("\n[run-slack-notify] All draft generations failed. Nothing to send to Slack.");
    if (draftErrors.length > 0) {
      console.log("Errors:", draftErrors);
    }
    process.exit(1);
  }

  console.log(`\n[run-slack-notify] ${items.length} drafts ready.`);

  // 3. Send to Slack (or dry-run preview)
  if (DRY_RUN) {
    console.log("\n[run-slack-notify] DRY RUN — not sending to Slack. Preview:\n");
    for (const { thread, draft } of items) {
      console.log(`\n--- Thread: ${thread.id} ---`);
      console.log(`Title: ${thread.title}`);
      console.log(`Subreddit: r/${thread.subreddit}`);
      console.log(`App URL: ${APP_URL}/signals/draft?id=${thread.id}`);
      console.log(`Draft:\n${draft}`);
      console.log("─".repeat(60));
    }
    return;
  }

  console.log("\n[run-slack-notify] Sending to Slack...");
  const { sent, failed, errors } = await notifySlackBatch(items, process.env.SLACK_WEBHOOK_URL);

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`  Threads found:   ${threads.length}`);
  console.log(`  Drafts generated: ${items.length}`);
  console.log(`  Draft failures:   ${draftErrors.length}`);
  console.log(`  Slack sent:       ${sent}`);
  console.log(`  Slack failed:     ${failed}`);

  if (errors.length > 0) {
    console.log("\n  Slack errors:");
    errors.forEach(e => console.log("    -", e));
  }

  if (sent > 0) {
    console.log(`\n✓ ${sent} notification(s) sent to Slack. Check #xpat-reddit-review.`);
  }
}

await run();
