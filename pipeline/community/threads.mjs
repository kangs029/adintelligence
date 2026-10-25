import { existsSync, readFileSync } from "node:fs";
import { copyFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { fetchMindcasePosts } from "./mindcase-client.mjs";
import { runClassify } from "./classify.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "community-threads.json");
const ARCHIVE_DIR = join("data", "artifacts", "community-threads-archive");
const QUERY_FILE = join("pipeline", "community", "queries.json");
const MAX_ARCHIVE_FILES = 10;

/**
 * Archives the current community-threads.json to a dated file in the
 * archive folder before a new sweep overwrites it.
 * Keeps only the last MAX_ARCHIVE_FILES archives, deleting the oldest.
 */
async function archiveCurrentArtifact({ root = process.cwd() } = {}) {
  const { mkdir } = await import("node:fs/promises");
  const artifactPath = join(root, ARTIFACT_FILE);
  const archiveDir = join(root, ARCHIVE_DIR);

  if (!existsSync(artifactPath)) return; // nothing to archive yet

  // Read generatedAt from the existing artifact for the archive filename
  let dateLabel;
  try {
    const existing = JSON.parse(readFileSync(artifactPath, "utf8"));
    dateLabel = (existing.meta?.generatedAt ?? new Date().toISOString()).slice(0, 10);
  } catch {
    dateLabel = new Date().toISOString().slice(0, 10);
  }

  await mkdir(archiveDir, { recursive: true });

  // Use timestamp to avoid collisions if swept multiple times per day
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const archiveName = `community-threads-${dateLabel}-${timestamp}.json`;
  const archivePath = join(archiveDir, archiveName);

  await copyFile(artifactPath, archivePath);
  console.log(`[threads] Archived → ${archiveName}`);

  // Prune oldest archives if over the limit
  const files = (await readdir(archiveDir))
    .filter((f) => f.startsWith("community-threads-") && f.endsWith(".json"))
    .sort(); // ascending — oldest first

  if (files.length > MAX_ARCHIVE_FILES) {
    const toDelete = files.slice(0, files.length - MAX_ARCHIVE_FILES);
    for (const file of toDelete) {
      await unlink(join(archiveDir, file));
      console.log(`[threads] Pruned old archive: ${file}`);
    }
  }
}

export function dailyGeneratedAt(value = new Date().toISOString()) {
  return `${value.slice(0, 10)}T00:00:00.000Z`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return readJson(path);
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function themeTags(text) {
  const value = text.toLowerCase();
  const themes = [];

  if (/send money|remit|remittance|transfer/iu.test(value)) themes.push("remittance");
  if (/kyc|verify|verification|document|identity/iu.test(value)) themes.push("kyc");
  if (/fee|rate|exchange|cost|expensive/iu.test(value)) themes.push("pricing");
  if (/failed|delay|stuck|support|problem|issue/iu.test(value)) themes.push("pain");
  if (/wise|remitly|xoom|western union|xpat|remit2any/iu.test(value)) themes.push("competitor");

  return themes.length > 0 ? themes : ["community"];
}

export function classifyThreadRecency({ capturedAt, publishedAt }) {
  const captured = new Date(capturedAt).getTime();
  const published = new Date(publishedAt).getTime();
  const days = (captured - published) / (24 * 60 * 60 * 1000);

  return days <= 60 ? "recent" : "historical";
}

/**
 * Normalizes a single Mindcase Reddit post row into the internal thread schema.
 *
 * Mindcase field names (from Reddit Posts API):
 *   "Reddit ID"     → unique post ID (without t3_ prefix)
 *   "Reddit URL"    → full URL to the post
 *   "Title"         → post title
 *   "Body"          → full post body text (text posts only)
 *   "Subreddit"     → subreddit name (without r/ prefix)
 *   "Author"        → Reddit username
 *   "Upvotes"       → upvote count
 *   "Upvote Ratio"  → 0–1 ratio
 *   "Comment Count" → number of comments
 *   "Posted"        → ISO 8601 timestamp
 *   "Flair"         → post flair/category (if set)
 *
 * @param {object} opts
 * @param {string} opts.capturedAt - ISO timestamp of the sweep
 * @param {object} opts.row        - A single row from Mindcase Reddit Posts API
 * @param {string} opts.query      - The search query that surfaced this post
 * @returns {object|undefined}
 */
export function normalizeMindcasePost({ capturedAt, row, query }) {
  if (!row) return undefined;

  // Mindcase Reddit Posts API returns camelCase field names:
  // redditId, redditUrl, title, body, subreddit, author,
  // upvotes, upvoteRatio, commentCount, posted, flair, over18
  const redditId = cleanText(row.redditId ?? row["Reddit ID"] ?? row.id ?? "");
  const title = cleanText(row.title ?? row.Title ?? "");
  const publishedAt = row.posted ?? row.Posted ?? row.created_at ?? null;

  if (!redditId || !title) return undefined;
  const parsedDate = publishedAt ? new Date(publishedAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return undefined;

  const publishedAtIso = parsedDate.toISOString();
  const url = cleanText(row.redditUrl ?? row["Reddit URL"] ?? row.url ?? "");
  const subreddit = cleanText(row.subreddit ?? row.Subreddit ?? "");
  const body = cleanText(row.body ?? row.Body ?? row.selftext ?? "");

  return {
    capturedAt,
    id: redditId.startsWith("t3_") ? redditId : `t3_${redditId}`,
    matchedQueries: [query],
    numComments: Number(row.commentCount ?? row["Comment Count"] ?? row.num_comments ?? 0),
    publishedAt: publishedAtIso,
    recency: classifyThreadRecency({ capturedAt, publishedAt: publishedAtIso }),
    score: Number(row.upvotes ?? row.Upvotes ?? row.score ?? 0),
    subreddit,
    ...(body ? { body } : {}),
    themes: themeTags(`${title} ${body} ${query}`),
    title,
    url,
  };
}

function mergeThreads(threads) {
  const byId = new Map();
  for (const thread of threads.filter(Boolean)) {
    const existing = byId.get(thread.id);
    if (!existing) {
      byId.set(thread.id, thread);
      continue;
    }

    byId.set(thread.id, {
      ...existing,
      matchedQueries: [...new Set([...existing.matchedQueries, ...thread.matchedQueries])].sort(),
      themes: [...new Set([...existing.themes, ...thread.themes])].sort(),
    });
  }

  return [...byId.values()].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

export function buildThreadsArtifact({
  generatedAt = new Date().toISOString(),
  queries,
  status = "ok",
  sweepErrors = [],
  threads,
}) {
  const mergedThreads = mergeThreads(threads);
  const recentCount = mergedThreads.filter((t) => t.recency === "recent").length;
  const historicalCount = mergedThreads.filter((t) => t.recency === "historical").length;
  const blocked = status !== "ok";

  return {
    meta: {
      caveats: [
        "capturedAt is the sweep time; publishedAt is the Reddit post creation time.",
        "Recent means published within 60 days of capturedAt.",
        "Data is retrieved via Mindcase Reddit Posts API — reflects Reddit's public index.",
        "Post body text is included when available (text posts only; link posts have no body).",
      ],
      family: "community-threads",
      generatedAt,
      method:
        "Search configured subreddits for remittance and competitor terms via Mindcase Reddit Posts API. Mindcase provides compliant Reddit access without requiring a Reddit developer application. Configure MINDCASE_API_KEY to enable sweeps.",
      provenance: blocked ? "connector-needed" : "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "Mindcase Reddit Posts API (mindcase.co)",
      version: 1,
    },
    data: {
      historicalCount,
      queries,
      recentCount,
      status,
      sweepErrors,
      threads: mergedThreads,
    },
  };
}

/**
 * Runs the full community thread sweep using Mindcase.
 *
 * For each query + subreddit combination in queries.json, calls
 * the Mindcase Reddit Posts API, normalizes the results, deduplicates
 * by Reddit post ID, and writes the artifact to disk.
 *
 * Optionally classifies threads immediately after collecting when
 * `classify: true` is passed. Classification is skipped when the
 * artifact status is "blocked" (no API key) or when there are no threads.
 *
 * @param {object}   opts
 * @param {string}   [opts.apiKey]      - Mindcase API key (default: MINDCASE_API_KEY env)
 * @param {boolean}  [opts.classify]    - run Step 2 classify after collecting (default: false)
 * @param {boolean}  [opts.forceClassify] - pass force=true to runClassify (reclassify all)
 * @param {Function} [opts.fetchImpl]   - fetch implementation (injectable for tests)
 * @param {string}   [opts.generatedAt] - ISO timestamp for this run
 * @param {string}   [opts.root]        - project root for file paths
 */
export async function runThreads({
  apiKey = process.env.MINDCASE_API_KEY,
  classify = false,
  forceClassify = false,
  fetchImpl = fetch,
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? dailyGeneratedAt(),
  root = process.cwd(),
} = {}) {
  const queryConfig = readJson(join(root, QUERY_FILE));
  const artifactPath = join(root, ARTIFACT_FILE);

  // Archive the existing artifact before overwriting with fresh data
  await archiveCurrentArtifact({ root });

  // No API key — write explicit blocked artifact instead of failing silently.
  if (!apiKey) {
    const artifact = buildThreadsArtifact({
      generatedAt,
      queries: queryConfig.queries,
      status: "blocked",
      sweepErrors: [
        {
          message:
            "MINDCASE_API_KEY is not configured. Add your Mindcase API key to .env.local to enable community thread collection.",
        },
      ],
      threads: [],
    });
    await writeDeterministicJson(artifactPath, artifact);
    return artifact;
  }

  const threads = [];
  const sweepErrors = [];

  for (const querySpec of queryConfig.queries) {
    for (const subreddit of querySpec.subreddits) {
      console.log(`[threads] Fetching r/${subreddit} — "${querySpec.query}"...`);
      const result = await fetchMindcasePosts({
        apiKey,
        subreddit,
        keyword: querySpec.query,
        sortBy: "new",
        timeRange: "week",
        fetchImpl,
      });

      if (result.error) {
        sweepErrors.push(result.error);
      }

      threads.push(
        ...result.rows.map((row) =>
          normalizeMindcasePost({
            capturedAt: generatedAt,
            row,
            query: querySpec.query,
          }),
        ),
      );
    }
  }

  // Step 1.5 removed — Haiku classification handles relevance filtering.
  // All collected threads are passed to the artifact; posts with relevanceScore < 0.4
  // are hidden in the UI by filterThreads() in CommunityThreads.tsx.
  const validThreads = threads.filter(Boolean);

  const artifact = buildThreadsArtifact({
    generatedAt,
    queries: queryConfig.queries,
    status: sweepErrors.length > 0 && validThreads.length === 0 ? "blocked" : "ok",
    sweepErrors,
    threads: validThreads,
  });
  await writeDeterministicJson(artifactPath, artifact);

  // Step 2 — Classify (optional, only when status is ok and there are threads)
  if (classify && artifact.data.status === "ok" && artifact.data.threads.length > 0) {
    return runClassify({ force: forceClassify, root });
  }

  return artifact;
}

export function latestThreadsArtifact({ root = process.cwd() } = {}) {
  return readJsonIfExists(join(root, ARTIFACT_FILE));
}

// Allow running directly: node pipeline/community/threads.mjs [--classify] [--force-classify]
const invokedPath = process.argv[1]
  ? new URL(`file://${process.argv[1]}`).pathname
  : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  const { loadPipelineEnv } = await import("../lib/env.mjs");
  await loadPipelineEnv();
  const classifyFlag = process.argv.includes("--classify") || process.argv.includes("--force-classify");
  const forceClassifyFlag = process.argv.includes("--force-classify");
  const result = await runThreads({ classify: classifyFlag, forceClassify: forceClassifyFlag });
  console.log(`[threads] Done. ${result.data.threads?.length ?? 0} threads, status: ${result.data.status}`);
}
