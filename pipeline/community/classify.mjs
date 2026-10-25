/**
 * Step 2 — Classify (pipeline orchestration)
 *
 * Reads the community-threads artifact, classifies each thread using
 * Claude Haiku (via lib/ai/community-classifier.mjs), and writes back.
 *
 * AI logic lives in lib/ai/community-classifier.mjs.
 * This file handles only: artifact I/O, batching, progress, rate limiting.
 *
 * Usage:
 *   node pipeline/community/classify.mjs              # classify all unclassified
 *   node pipeline/community/classify.mjs --force      # reclassify everything
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadPipelineEnv } from "../lib/env.mjs";
import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";
import {
  RELEVANCE_RESPOND_THRESHOLD,
  INTENT_VALUES,
  SENTIMENT_VALUES,
  URGENCY_VALUES,
  DIRECTION_VALUES,
  LANGUAGE_VALUES,
  USE_CASE_VALUES,
  buildClassifyPrompt,
  invokeHaiku,
  parseClassification,
  classifyThread,
} from "../../lib/ai/community-classifier.mjs";

// Re-export constants so existing tests importing from this file still work
export {
  RELEVANCE_RESPOND_THRESHOLD as RELEVANCE_DRAFT_THRESHOLD,
  INTENT_VALUES,
  SENTIMENT_VALUES,
  URGENCY_VALUES,
  DIRECTION_VALUES,
  LANGUAGE_VALUES,
  USE_CASE_VALUES,
  buildClassifyPrompt,
  invokeHaiku,
  parseClassification,
  classifyThread,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARTIFACT_FILE = join("data", "artifacts", "community-threads.json");
const REQUEST_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

export async function runClassify({
  client,
  force = false,
  root = process.cwd(),
  onProgress,
  retryDelayMs,
} = {}) {
  await loadPipelineEnv({ root });

  const artifactPath = join(root, ARTIFACT_FILE);

  if (!existsSync(artifactPath)) {
    throw new Error(
      `community-threads artifact not found at ${artifactPath}. Run threads.mjs first.`,
    );
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const threads = artifact?.data?.threads ?? [];

  const toClassify = force
    ? threads
    : threads.filter((t) => !t.classifiedAt && !t.classifyError);

  const unchanged = force ? [] : threads.filter((t) => t.classifiedAt || t.classifyError);

  console.log(
    `[classify] ${toClassify.length} threads to classify, ${unchanged.length} already done.`,
  );

  if (toClassify.length === 0) {
    console.log("[classify] Nothing to do. Pass --force to reclassify.");
    return artifact;
  }

  const classifiedResults = [];
  let errorCount = 0;

  for (let i = 0; i < toClassify.length; i++) {
    const thread = toClassify[i];
    const result = await classifyThread({ thread, client, retryDelayMs });

    if (result.classifyError) {
      errorCount++;
      console.warn(`[classify] ⚠  ${thread.id} — ${result.classifyError.slice(0, 80)}`);
    }

    classifiedResults.push(result);

    if (onProgress) onProgress(i + 1, toClassify.length, result);

    if (i < toClassify.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  const byId = new Map(classifiedResults.map((t) => [t.id, t]));
  const updatedThreads = threads.map((t) => byId.get(t.id) ?? t);

  const draftReady = updatedThreads.filter(
    (t) => t.isRelevant === true || (typeof t.relevanceScore === "number" && t.relevanceScore >= RELEVANCE_RESPOND_THRESHOLD),
  ).length;

  const updatedArtifact = {
    ...artifact,
    data: {
      ...artifact.data,
      classifyErrors: errorCount,
      classifiedCount: updatedThreads.filter((t) => t.classifiedAt).length,
      draftReadyCount: draftReady,
      threads: updatedThreads,
    },
    meta: {
      ...artifact.meta,
      classifiedAt: new Date().toISOString(),
    },
  };

  await writeDeterministicJsonPreservingArrays(artifactPath, updatedArtifact);

  console.log(
    `[classify] Done. ${classifiedResults.length - errorCount} classified, ${errorCount} errors, ${draftReady} ready for drafting.`,
  );

  return updatedArtifact;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const invokedPath = process.argv[1]
  ? new URL(`file://${process.argv[1]}`).pathname
  : "";

if (invokedPath === new URL(import.meta.url).pathname) {
  const force = process.argv.includes("--force");
  await runClassify({
    force,
    onProgress: (current, total) => {
      if (current % 10 === 0 || current === total) {
        console.log(`[classify] ${current}/${total}`);
      }
    },
  });
}
