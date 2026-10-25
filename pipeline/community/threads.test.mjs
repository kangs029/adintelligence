import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildThreadsArtifact,
  classifyThreadRecency,
  dailyGeneratedAt,
  normalizeMindcasePost,
  runThreads,
} from "./threads.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal temp project root with queries.json and artifact dirs. */
function makeTempRoot(queries = defaultQueries()) {
  const root = mkdtempSync(join(tmpdir(), "xpat-threads-"));
  mkdirSync(join(root, "pipeline", "community"), { recursive: true });
  mkdirSync(join(root, "data", "artifacts"), { recursive: true });
  writeFileSync(
    join(root, "pipeline", "community", "queries.json"),
    JSON.stringify({ queries }),
  );
  return root;
}

function defaultQueries() {
  return [{ query: "send money to india", subreddits: ["nri", "h1b"] }];
}

/** A minimal valid Mindcase post row matching the Reddit Posts API schema. */
function mindcaseRow(overrides = {}) {
  return {
    "Reddit ID": "abc123",
    "Reddit URL": "https://www.reddit.com/r/nri/comments/abc123/best_way/",
    "Title": "Best way to send money to India from the US?",
    "Body": "I just moved to the US and need to send money home every month.",
    "Subreddit": "nri",
    "Author": "test_user",
    "Upvotes": 42,
    "Upvote Ratio": 0.94,
    "Comment Count": 14,
    "Posted": "2026-08-20T12:00:00Z",
    "Flair": "Question",
    ...overrides,
  };
}

/** A fetchImpl that returns a successful Mindcase response for any call. */
function mockMindcaseFetch(rows = [mindcaseRow()]) {
  return async () =>
    Response.json({ results: rows });
}

// ---------------------------------------------------------------------------
// dailyGeneratedAt
// ---------------------------------------------------------------------------

describe("dailyGeneratedAt", () => {
  it("truncates any ISO timestamp to midnight UTC", () => {
    expect(dailyGeneratedAt("2026-07-03T18:17:02.528Z")).toBe("2026-07-03T00:00:00.000Z");
  });

  it("defaults to today when no value is provided", () => {
    const result = dailyGeneratedAt();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/u);
  });
});

// ---------------------------------------------------------------------------
// classifyThreadRecency
// ---------------------------------------------------------------------------

describe("classifyThreadRecency", () => {
  it("classifies a post published 59 days ago as recent", () => {
    expect(
      classifyThreadRecency({
        capturedAt: "2026-07-03T00:00:00.000Z",
        publishedAt: "2026-05-04T00:00:00.000Z",
      }),
    ).toBe("recent");
  });

  it("classifies a post published exactly 60 days ago as recent", () => {
    expect(
      classifyThreadRecency({
        capturedAt: "2026-07-03T00:00:00.000Z",
        publishedAt: "2026-05-04T00:00:00.000Z",
      }),
    ).toBe("recent");
  });

  it("classifies a post published more than 60 days ago as historical", () => {
    expect(
      classifyThreadRecency({
        capturedAt: "2026-07-03T00:00:00.000Z",
        publishedAt: "2026-05-03T23:59:59.000Z",
      }),
    ).toBe("historical");
  });
});

// ---------------------------------------------------------------------------
// normalizeMindcasePost
// ---------------------------------------------------------------------------

describe("normalizeMindcasePost", () => {
  it("maps all Mindcase field names to the internal thread schema", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow(),
      query: "send money to india",
    });

    expect(record).toMatchObject({
      capturedAt: "2026-09-01T00:00:00.000Z",
      id: "t3_abc123",
      matchedQueries: ["send money to india"],
      numComments: 14,
      publishedAt: "2026-08-20T12:00:00.000Z",
      recency: "recent",
      score: 42,
      subreddit: "nri",
      title: "Best way to send money to India from the US?",
      url: "https://www.reddit.com/r/nri/comments/abc123/best_way/",
    });
  });

  it("includes body text when present", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Body: "I need to send $500 to my parents." }),
      query: "send money to india",
    });

    expect(record?.body).toBe("I need to send $500 to my parents.");
  });

  it("omits body field when body is empty", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Body: "" }),
      query: "send money to india",
    });

    expect(record).not.toHaveProperty("body");
  });

  it("prefixes id with t3_ if not already present", () => {
    const withPrefix = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ "Reddit ID": "t3_abc123" }),
      query: "send money to india",
    });
    const withoutPrefix = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ "Reddit ID": "abc123" }),
      query: "send money to india",
    });

    expect(withPrefix?.id).toBe("t3_abc123");
    expect(withoutPrefix?.id).toBe("t3_abc123");
  });

  it("tags remittance theme from title", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Title: "Send money to India — which service is best?" }),
      query: "send money to india",
    });

    expect(record?.themes).toContain("remittance");
  });

  it("tags competitor theme when competitor name appears in title", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Title: "Wise vs Remitly for India transfers" }),
      query: "wise remitly xoom",
    });

    expect(record?.themes).toContain("competitor");
  });

  it("tags pain theme when pain keywords appear in body", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({
        Title: "Help needed",
        Body: "My transfer has been stuck for 3 days",
      }),
      query: "transfer failed india",
    });

    expect(record?.themes).toContain("pain");
  });

  it("falls back to community theme when no specific theme is detected", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Title: "Hello from r/nri", Body: "" }),
      query: "nri",
    });

    expect(record?.themes).toEqual(["community"]);
  });

  it("returns undefined for rows missing Reddit ID", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ "Reddit ID": "" }),
      query: "send money to india",
    });

    expect(record).toBeUndefined();
  });

  it("returns undefined for rows missing title", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Title: "" }),
      query: "send money to india",
    });

    expect(record).toBeUndefined();
  });

  it("returns undefined for rows with an unparseable Posted date", () => {
    const record = normalizeMindcasePost({
      capturedAt: "2026-09-01T00:00:00.000Z",
      row: mindcaseRow({ Posted: "not-a-date" }),
      query: "send money to india",
    });

    expect(record).toBeUndefined();
  });

  it("returns undefined for a null row", () => {
    expect(
      normalizeMindcasePost({ capturedAt: "2026-09-01T00:00:00.000Z", row: null, query: "q" }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildThreadsArtifact
// ---------------------------------------------------------------------------

describe("buildThreadsArtifact", () => {
  it("uses Mindcase as the source and snapshot as provenance when threads are present", () => {
    const artifact = buildThreadsArtifact({
      generatedAt: "2026-09-01T00:00:00.000Z",
      queries: [{ query: "send money to india", subreddits: ["nri"] }],
      status: "ok",
      threads: [
        normalizeMindcasePost({
          capturedAt: "2026-09-01T00:00:00.000Z",
          row: mindcaseRow(),
          query: "send money to india",
        }),
      ],
    });

    expect(artifact.meta.source).toContain("Mindcase");
    expect(artifact.meta.provenance).toBe("snapshot");
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.threads).toHaveLength(1);
    expect(artifact.data.recentCount).toBe(1);
    expect(artifact.data.historicalCount).toBe(0);
  });

  it("sets provenance to connector-needed and status to blocked when blocked", () => {
    const artifact = buildThreadsArtifact({
      generatedAt: "2026-09-01T00:00:00.000Z",
      queries: [{ query: "send money to india", subreddits: ["nri"] }],
      status: "blocked",
      sweepErrors: [{ message: "MINDCASE_API_KEY is not configured." }],
      threads: [],
    });

    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
    expect(artifact.data.threads).toHaveLength(0);
    expect(artifact.data.recentCount).toBe(0);
  });

  it("deduplicates threads that appear across multiple query+subreddit combinations", () => {
    const row = mindcaseRow();
    const artifact = buildThreadsArtifact({
      generatedAt: "2026-09-01T00:00:00.000Z",
      queries: [],
      status: "ok",
      threads: [
        normalizeMindcasePost({ capturedAt: "2026-09-01T00:00:00.000Z", row, query: "send money to india" }),
        normalizeMindcasePost({ capturedAt: "2026-09-01T00:00:00.000Z", row, query: "remittance india" }),
      ],
    });

    expect(artifact.data.threads).toHaveLength(1);
    expect(artifact.data.threads[0].matchedQueries).toEqual([
      "remittance india",
      "send money to india",
    ]);
  });
});

// ---------------------------------------------------------------------------
// runThreads — integration-style tests with mocked fetch
// ---------------------------------------------------------------------------

describe("runThreads", () => {
  it("writes a blocked artifact when MINDCASE_API_KEY is missing", async () => {
    const root = makeTempRoot();

    const artifact = await runThreads({
      apiKey: undefined,
      fetchImpl: mockMindcaseFetch(),
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    expect(artifact.data.status).toBe("blocked");
    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.threads).toHaveLength(0);
    expect(artifact.data.sweepErrors[0].message).toContain("MINDCASE_API_KEY");
  });

  it("calls Mindcase once per query+subreddit combination", async () => {
    const calls = [];
    const root = makeTempRoot([
      { query: "send money to india", subreddits: ["nri", "h1b"] },
      { query: "remittance india", subreddits: ["nri"] },
    ]);

    await runThreads({
      apiKey: "mk_live_test_key",
      fetchImpl: async (url, opts) => {
        calls.push({ url: String(url), body: JSON.parse(opts.body) });
        return Response.json({ results: [mindcaseRow()] });
      },
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    // 2 subreddits for query 1 + 1 subreddit for query 2 = 3 calls total
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.url.includes("mindcase.co"))).toBe(true);
  });

  it("sends the correct Authorization header with the API key", async () => {
    const headers = [];
    const root = makeTempRoot();

    await runThreads({
      apiKey: "mk_live_test_key",
      fetchImpl: async (_url, opts) => {
        headers.push(opts.headers.Authorization);
        return Response.json({ results: [mindcaseRow()] });
      },
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    expect(headers.every((h) => h === "Bearer mk_live_test_key")).toBe(true);
  });

  it("writes a successful artifact with normalized threads when Mindcase responds", async () => {
    const root = makeTempRoot();

    const artifact = await runThreads({
      apiKey: "mk_live_test_key",
      fetchImpl: mockMindcaseFetch([mindcaseRow(), mindcaseRow({ "Reddit ID": "xyz999", Title: "Remittance question" })]),
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    expect(artifact.data.status).toBe("ok");
    expect(artifact.meta.provenance).toBe("snapshot");
    expect(artifact.data.threads.length).toBeGreaterThan(0);
    expect(artifact.data.threads[0]).toHaveProperty("id");
    expect(artifact.data.threads[0]).toHaveProperty("title");
    expect(artifact.data.threads[0]).toHaveProperty("publishedAt");
  });

  it("records sweep errors when Mindcase returns HTTP errors but continues other queries", async () => {
    const root = makeTempRoot([
      { query: "send money to india", subreddits: ["nri", "h1b"] },
    ]);
    let callCount = 0;

    const artifact = await runThreads({
      apiKey: "mk_live_test_key",
      fetchImpl: async () => {
        callCount += 1;
        // First call fails, second succeeds
        if (callCount === 1) {
          return new Response("Unauthorized", { status: 401 });
        }
        return Response.json({ results: [mindcaseRow()] });
      },
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    expect(artifact.data.sweepErrors).toHaveLength(1);
    expect(artifact.data.sweepErrors[0].status).toBe(401);
    // Still has threads from the successful second call
    expect(artifact.data.threads.length).toBeGreaterThan(0);
    expect(artifact.data.status).toBe("ok");
  });

  it("marks status blocked only when all queries fail and no threads are collected", async () => {
    const root = makeTempRoot();

    const artifact = await runThreads({
      apiKey: "mk_live_test_key",
      fetchImpl: async () => new Response("Server Error", { status: 500 }),
      generatedAt: "2026-09-01T00:00:00.000Z",
      root,
    });

    expect(artifact.data.status).toBe("blocked");
    expect(artifact.data.threads).toHaveLength(0);
    expect(artifact.data.sweepErrors.length).toBeGreaterThan(0);
  });
});
