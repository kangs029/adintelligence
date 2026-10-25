import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { classifyThreadRecency } from "./threads.mjs";

const RAW_FILE = join("data", "raw", "v1-port", "community.json");
const ARTIFACT_FILE = join("data", "artifacts", "community-threads.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isoDate(value) {
  return `${value}T00:00:00.000Z`;
}

function subtractDays(dateString, days) {
  const date = new Date(isoDate(dateString));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function redditIdFromLink(link) {
  return link.match(/\/comments\/([^/]+)/u)?.[1] ?? link;
}

function subredditFromPlatform(platform) {
  return platform.match(/r\/([^/\s]+)/iu)?.[1] ?? "unknown";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function renderedText(value) {
  return String(value ?? "").replace(/[\u2013\u2014]/gu, "-");
}

function isRedditSearchLink(link) {
  try {
    const url = new URL(link);
    return /\/search\/?$/iu.test(url.pathname);
  } catch {
    return /\/search\/?(?:\?|$)/iu.test(String(link ?? ""));
  }
}

function themeTags(row) {
  const text = `${renderedText(row.title)} ${renderedText(row.pain)} ${renderedText(row.responseAngle)}`.toLowerCase();
  const themes = [];

  if (/recurring|loan repayment|monthly/iu.test(text)) themes.push("recurring transfer");
  if (/urgent|large|55k|50 lakhs|high-value/iu.test(text)) themes.push("high-value transfer");
  if (/rate|fee|spread|comparison|best|worst|platform/iu.test(text)) themes.push("comparison shopping");
  if (/kyc|verification|documentation|compliance/iu.test(text)) themes.push("verification anxiety");
  if (/h-?1b|new-worker|new worker/iu.test(text)) themes.push("newcomer education");
  if (/family|parents|home/iu.test(text)) themes.push("family support");

  return themes.length > 0 ? unique(themes) : ["community demand"];
}

export function isThreadEvidence(row) {
  return (
    /^Reddit/iu.test(row.platform ?? "") &&
    /\/comments\//u.test(row.link ?? "") &&
    !/search\?/iu.test(row.link ?? "")
  );
}

export function publishedAtFromSourceAge(row) {
  const label = String(row.sourceAgeLabel ?? "").toLowerCase();
  const baseDate = row.sourceCheckedAt ?? row.capturedAt;

  const dayMatch = label.match(/(\d+(?:\.\d+)?)\s+days?\s+old/u);
  if (dayMatch) {
    return {
      precision: "source age label",
      publishedAt: subtractDays(baseDate, Math.round(Number(dayMatch[1]))),
    };
  }

  if (label.includes("last month")) {
    return {
      precision: "approximate from source age label",
      publishedAt: subtractDays(baseDate, 30),
    };
  }

  const yearMatch = label.match(/about\s+(\d+(?:\.\d+)?)\s+years?\s+old/u);
  if (yearMatch) {
    return {
      precision: "approximate from source age label",
      publishedAt: subtractDays(baseDate, Math.round(Number(yearMatch[1]) * 365)),
    };
  }

  if (label.includes("historical")) {
    return {
      precision: "undated historical from v1 source label",
      publishedAt: null,
    };
  }

  return {
    precision: "unknown",
    publishedAt: null,
  };
}

export function normalizeV1Thread(row, index) {
  const capturedAt = isoDate(row.capturedAt);
  const published = publishedAtFromSourceAge(row);
  const matchedQueries = unique([
    renderedText(row.title),
    row.sourceFreshness,
    row.action ? `action:${row.action}` : "",
    row.priority ? `priority:${row.priority}` : "",
  ]);

  return {
    action: row.action,
    capturedAt,
    id: `t3_${redditIdFromLink(row.link)}`,
    matchedQueries,
    numComments: 0,
    pain: renderedText(row.pain),
    platform: row.platform,
    priority: row.priority,
    publishedAt: published.publishedAt,
    publishedAtPrecision: published.precision,
    recency: published.publishedAt
      ? classifyThreadRecency({ capturedAt, publishedAt: published.publishedAt })
      : "historical",
    responseAngle: renderedText(row.responseAngle),
    score: 0,
    sensitivity: renderedText(row.sensitivity),
    sourceAgeLabel: row.sourceAgeLabel,
    sourceCheckedAt: isoDate(row.sourceCheckedAt),
    sourceFreshness: row.sourceFreshness,
    subreddit: subredditFromPlatform(row.platform),
    themes: themeTags(row),
    title: renderedText(row.title),
    url: row.link,
    v1Index: index,
  };
}

export function buildV1ThreadsArtifact({ raw, generatedAt } = {}) {
  const source = raw ?? readJson(RAW_FILE);
  const threadRows = source.threads.filter(isThreadEvidence);
  const monitorQueues = source.threads
    .filter((row) => !isThreadEvidence(row))
    .map((row, index) => ({
      action: row.action,
      capturedAt: isoDate(row.capturedAt),
      link: row.link,
      platform: row.platform,
      priority: row.priority,
      reason: isRedditSearchLink(row.link)
        ? "Saved search queue, not a thread evidence row."
        : "Review or non-thread surface, not a Reddit thread evidence row.",
      responseAngle: renderedText(row.responseAngle),
      sourceAgeLabel: row.sourceAgeLabel,
      title: renderedText(row.title),
      v1Index: index,
    }));
  const threads = threadRows.map(normalizeV1Thread);
  const recentCount = threads.filter((thread) => thread.recency === "recent").length;
  const historicalCount = threads.filter((thread) => thread.recency === "historical").length;
  const latestCapturedAt = source.threads.map((thread) => thread.capturedAt).sort().at(-1);

  return {
    meta: {
      caveats: [
        "Thread rows are ported from v1 with original capturedAt dates preserved.",
        "publishedAt is derived from the v1 posted-age label only when the source label contains a usable age.",
        "Historical label-only rows remain undated instead of receiving placeholder dates.",
        "Monitor queues are not counted as thread evidence.",
      ],
      family: "community-threads",
      generatedAt: generatedAt ?? isoDate(latestCapturedAt),
      method:
        "Port v1 Reddit thread bank from data/raw/v1-port/community.json, excluding saved searches and non-thread surfaces from thread cards.",
      provenance: "snapshot",
      refreshCadence: "weekly when Reddit API access is configured",
      source: "v1 data/grounded/community.json threads",
      version: 2,
    },
    data: {
      connectorNote: {
        label: "Reddit API access makes this live-refreshable",
        status: "connector-needed",
      },
      historicalCount,
      monitorQueues,
      queries: source.liveConnector?.queries ?? [],
      recentCount,
      status: "ok",
      sweepErrors: [],
      threads,
    },
  };
}

export async function runV1ThreadsPort({ root = process.cwd() } = {}) {
  const artifact = buildV1ThreadsArtifact({
    raw: readJson(join(root, RAW_FILE)),
  });
  await writeDeterministicJson(join(root, ARTIFACT_FILE), artifact);
  return artifact;
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  await runV1ThreadsPort();
}
