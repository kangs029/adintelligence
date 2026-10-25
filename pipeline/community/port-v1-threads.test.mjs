import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildV1ThreadsArtifact,
  isThreadEvidence,
  publishedAtFromSourceAge,
} from "./port-v1-threads.mjs";

const raw = JSON.parse(readFileSync("data/raw/v1-port/community.json", "utf8"));

describe("v1 community thread port", () => {
  it("renders only real Reddit comment links as thread evidence", () => {
    const artifact = buildV1ThreadsArtifact({ raw });

    expect(artifact.data.threads).toHaveLength(8);
    expect(artifact.data.monitorQueues).toHaveLength(2);
    expect(artifact.data.threads.every((thread) => thread.url.includes("/comments/"))).toBe(true);
    expect(artifact.data.monitorQueues.map((queue) => queue.title)).toContain("Recent remittance thread queue");
  });

  it("preserves capturedAt and classifies recency from derived publishedAt", () => {
    const artifact = buildV1ThreadsArtifact({ raw });
    const recent = artifact.data.threads.find(
      (thread) => thread.title === "Best platform for recurring USD to INR transfers",
    );

    expect(recent).toMatchObject({
      capturedAt: "2026-06-19T00:00:00.000Z",
      publishedAt: "2026-06-16T00:00:00.000Z",
      recency: "recent",
    });
    expect(artifact.data.historicalCount + artifact.data.recentCount).toBe(8);
  });

  it("detects saved searches as monitor queues, not threads", () => {
    const searchQueue = raw.threads.find((thread) => thread.link.includes("/search/"));
    const artifact = buildV1ThreadsArtifact({ raw });
    const renderedQueue = artifact.data.monitorQueues.find(
      (queue) => queue.link === searchQueue.link,
    );

    expect(isThreadEvidence(searchQueue)).toBe(false);
    expect(renderedQueue).toMatchObject({
      reason: "Saved search queue, not a thread evidence row.",
    });
    expect(publishedAtFromSourceAge(raw.threads[0])).toMatchObject({
      precision: "source age label",
      publishedAt: "2026-06-16T00:00:00.000Z",
    });
  });

  it("keeps label-only historical rows undated instead of inventing publishedAt", () => {
    const artifact = buildV1ThreadsArtifact({ raw });
    const historical = artifact.data.threads.find(
      (thread) => thread.sourceAgeLabel === "Historical thread, not current outreach",
    );

    expect(historical).toMatchObject({
      publishedAt: null,
      publishedAtPrecision: "undated historical from v1 source label",
      recency: "historical",
    });
    expect(publishedAtFromSourceAge(historical)).toMatchObject({
      precision: "undated historical from v1 source label",
      publishedAt: null,
    });
  });
});
