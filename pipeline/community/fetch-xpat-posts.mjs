/**
 * pipeline/community/fetch-xpat-posts.mjs
 *
 * Fetches XPAT/Remit2Any specific Reddit posts via Mindcase Posts API
 * and merges them into community-threads.json.
 *
 * Runs targeted URL-based fetches for posts that mention XPAT or Remit2Any
 * directly — supplements the keyword-based sweep in threads.mjs.
 *
 * Usage:
 *   node pipeline/community/fetch-xpat-posts.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadPipelineEnv } from "../lib/env.mjs";
import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";
import { normalizeMindcasePost, buildThreadsArtifact, classifyThreadRecency } from "./threads.mjs";

const THREADS_FILE = join("data", "artifacts", "community-threads.json");
const MINDCASE_POSTS_URL = "https://api.mindcase.co/v1/data/reddit/posts/run?wait=true";

// ---------------------------------------------------------------------------
// XPAT/Remit2Any Reddit posts — targeted URL sweep
// ---------------------------------------------------------------------------

const XPAT_POST_URLS = [
  "https://www.reddit.com/r/nri/comments/1hl9idy/is_remit2any_legit/",
  "https://www.reddit.com/r/backtoindia/comments/1uwkspk/beaware_of_remittance_apps_like_unplex_or_xpat/",
  "https://www.reddit.com/r/nri/comments/1nfq0bn/remit2any_and_us_taxes/",
  "https://www.reddit.com/r/nriFIRE/comments/1qjrab7/tracking_my_search_for_an_international_transfer/",
  "https://www.reddit.com/r/tax/comments/1rcfpln/remit2any_and_us_taxes/",
  "https://www.reddit.com/r/nri/comments/1j8qkl8/been_sending_money_to_india_for_a_while_but_i/",
  "https://www.reddit.com/r/nri/comments/1j4mx6l/how_do_you_guys_choose_the_usdtoinr_remittance/",
  "https://www.reddit.com/r/nri/comments/1u7glrg/best_platform_for_recurring_usd_to_inr_transfers/",
];

// ---------------------------------------------------------------------------
// Fetch a single post by URL via Mindcase
// ---------------------------------------------------------------------------

async function fetchPostByUrl(url, apiKey) {
  let response;
  try {
    response = await fetch(MINDCASE_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        params: {
          urls: url,
          sortBy: "new",
          timeRange: "all",
        },
      }),
    });
  } catch (err) {
    return { rows: [], error: String(err?.message ?? err) };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { rows: [], error: `HTTP ${response.status}: ${body.slice(0, 200)}` };
  }

  let json;
  try { json = await response.json(); } catch {
    return { rows: [], error: "Non-JSON response" };
  }

  const rows = json?.results ?? json?.data ?? json?.rows ?? [];
  return { rows: Array.isArray(rows) ? rows : [], error: null };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  await loadPipelineEnv();

  const apiKey = process.env.MINDCASE_API_KEY;
  if (!apiKey) {
    console.error("[xpat-posts] MINDCASE_API_KEY not configured");
    process.exit(1);
  }

  if (!existsSync(THREADS_FILE)) {
    console.error("[xpat-posts] community-threads.json not found — run threads.mjs first");
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(THREADS_FILE, "utf8"));
  const existingIds = new Set(artifact.data.threads.map(t => t.id));
  const capturedAt = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";

  console.log(`[xpat-posts] Existing threads: ${existingIds.size}`);
  console.log(`[xpat-posts] Fetching ${XPAT_POST_URLS.length} XPAT/Remit2Any posts...`);

  const newThreads = [];
  let fetched = 0;
  let skipped = 0;
  let errors = 0;

  for (const url of XPAT_POST_URLS) {
    const shortUrl = url.split("/comments/")[1]?.split("/")[0] ?? url;
    console.log(`[xpat-posts]   Fetching ${shortUrl}...`);

    const { rows, error } = await fetchPostByUrl(url, apiKey);

    if (error) {
      console.warn(`[xpat-posts]   ⚠ Error: ${error}`);
      errors++;
      continue;
    }

    for (const row of rows) {
      const thread = normalizeMindcasePost({
        capturedAt,
        row,
        query: "xpat remit2any",
      });

      if (!thread) continue;

      if (existingIds.has(thread.id)) {
        console.log(`[xpat-posts]   Already exists: ${thread.id}`);
        skipped++;
        continue;
      }

      // Mark as XPAT-specific and ensure competitor mentions include XPAT
      thread.xpatSpecific = true;
      if (!thread.competitorMentions) thread.competitorMentions = [];
      if (!thread.competitorMentions.includes("XPAT") && !thread.competitorMentions.includes("Remit2any")) {
        thread.competitorMentions.push("XPAT");
      }

      newThreads.push(thread);
      existingIds.add(thread.id);
      fetched++;
      console.log(`[xpat-posts]   ✓ ${thread.id} — ${thread.title.slice(0, 60)}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n[xpat-posts] Fetched: ${fetched} new | Skipped: ${skipped} existing | Errors: ${errors}`);

  if (newThreads.length === 0) {
    console.log("[xpat-posts] No new threads to add.");
    return;
  }

  // Merge new threads into artifact
  const allThreads = [...artifact.data.threads, ...newThreads];
  const recentCount = allThreads.filter(t => t.recency === "recent").length;
  const historicalCount = allThreads.filter(t => t.recency === "historical").length;

  const updated = {
    ...artifact,
    data: {
      ...artifact.data,
      threads: allThreads,
      recentCount,
      historicalCount,
    },
    meta: {
      ...artifact.meta,
      xpatPostsAddedAt: new Date().toISOString(),
    },
  };

  await writeDeterministicJsonPreservingArrays(THREADS_FILE, updated);
  console.log(`[xpat-posts] ✓ Merged ${newThreads.length} XPAT posts → community-threads.json (total: ${allThreads.length})`);
}

await run();
