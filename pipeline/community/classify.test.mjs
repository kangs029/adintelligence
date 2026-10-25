import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  INTENT_VALUES,
  RELEVANCE_DRAFT_THRESHOLD,
  SENTIMENT_VALUES,
  URGENCY_VALUES,
  buildClassifyPrompt,
  classifyThread,
  parseClassification,
  runClassify,
} from "./classify.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal temp project root with a community-threads artifact. */
function makeTempRoot(threads = []) {
  const root = mkdtempSync(join(tmpdir(), "xpat-classify-"));
  mkdirSync(join(root, "data", "artifacts"), { recursive: true });
  mkdirSync(join(root, "pipeline", "community"), { recursive: true });

  const artifact = {
    meta: { generatedAt: "2026-09-01T00:00:00.000Z", provenance: "snapshot", version: 1 },
    data: {
      historicalCount: threads.filter((t) => t.recency === "historical").length,
      queries: [],
      recentCount: threads.filter((t) => t.recency === "recent").length,
      status: "ok",
      sweepErrors: [],
      threads,
    },
  };

  writeFileSync(
    join(root, "data", "artifacts", "community-threads.json"),
    JSON.stringify(artifact),
  );

  return root;
}

/** A minimal valid community thread. */
function makeThread(overrides = {}) {
  return {
    capturedAt: "2026-09-01T00:00:00.000Z",
    id: "t3_test01",
    matchedQueries: ["send money to india"],
    numComments: 14,
    publishedAt: "2026-08-20T12:00:00.000Z",
    recency: "recent",
    score: 42,
    subreddit: "nri",
    themes: ["remittance"],
    title: "Best way to send money from US to India?",
    body: "I just moved to the US and want to send money home every month. Any recommendations?",
    url: "https://www.reddit.com/r/nri/comments/test01/",
    ...overrides,
  };
}

/** A valid classification payload the LLM would return. */
function validLlmResponse() {
  return JSON.stringify({
    intent: "community_recommendation",
    sentiment: "neutral",
    urgency: "medium",
    relevanceScore: 0.85,
    competitorMentions: ["Wise", "Remitly"],
    language: "English",
    useCase: "first_transfer",
  });
}

/** Returns a mock Bedrock client whose send() resolves with a text response. */
function mockClient(text = validLlmResponse()) {
  return {
    send: vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(
        JSON.stringify({ content: [{ type: "text", text }] }),
      ),
    }),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("RELEVANCE_DRAFT_THRESHOLD is 0.7", () => {
    expect(RELEVANCE_DRAFT_THRESHOLD).toBe(0.7);
  });

  it("INTENT_VALUES contains all 8 taxonomy categories", () => {
    expect(INTENT_VALUES).toContain("remittance_comparison");
    expect(INTENT_VALUES).toContain("pricing_pain");
    expect(INTENT_VALUES).toContain("speed_concern");
    expect(INTENT_VALUES).toContain("trust_issue");
    expect(INTENT_VALUES).toContain("new_to_us");
    expect(INTENT_VALUES).toContain("community_recommendation");
    expect(INTENT_VALUES).toContain("competitor_complaint");
    expect(INTENT_VALUES).toContain("other");
    expect(INTENT_VALUES).toHaveLength(8);
  });

  it("SENTIMENT_VALUES contains positive | neutral | negative", () => {
    expect(SENTIMENT_VALUES).toEqual(["positive", "neutral", "negative"]);
  });

  it("URGENCY_VALUES contains high | medium | low", () => {
    expect(URGENCY_VALUES).toEqual(["high", "medium", "low"]);
  });
});

// ---------------------------------------------------------------------------
// buildClassifyPrompt
// ---------------------------------------------------------------------------

describe("buildClassifyPrompt", () => {
  it("returns an object with system and user keys", () => {
    const thread = makeThread();
    const prompt = buildClassifyPrompt(thread);
    expect(prompt).toHaveProperty("system");
    expect(prompt).toHaveProperty("user");
  });

  it("embeds the subreddit name in the user prompt", () => {
    const thread = makeThread({ subreddit: "h1b" });
    const { user } = buildClassifyPrompt(thread);
    expect(user).toContain("r/h1b");
  });

  it("includes the thread title in the user prompt", () => {
    const thread = makeThread({ title: "How to send money abroad?" });
    const { user } = buildClassifyPrompt(thread);
    expect(user).toContain("How to send money abroad?");
  });

  it("includes thread body when present", () => {
    const thread = makeThread({ body: "Need help with remittance." });
    const { user } = buildClassifyPrompt(thread);
    expect(user).toContain("Need help with remittance.");
  });

  it("handles a thread with no body without throwing", () => {
    const thread = makeThread({ body: undefined });
    expect(() => buildClassifyPrompt(thread)).not.toThrow();
  });

  it("truncates very long body text to prevent oversized prompts", () => {
    const longBody = "x".repeat(10_000);
    const thread = makeThread({ body: longBody });
    const { user } = buildClassifyPrompt(thread);
    // The combined title+body slice is capped at 3000 chars in the implementation
    expect(user.length).toBeLessThan(4000);
  });

  it("system prompt mentions all 7 intent taxonomy values", () => {
    const thread = makeThread();
    const { system } = buildClassifyPrompt(thread);
    const intentsInSpec = [
      "remittance_comparison",
      "pricing_pain",
      "speed_concern",
      "trust_issue",
      "new_to_us",
      "community_recommendation",
      "competitor_complaint",
    ];
    for (const intent of intentsInSpec) {
      expect(system).toContain(intent);
    }
  });
});

// ---------------------------------------------------------------------------
// parseClassification
// ---------------------------------------------------------------------------

describe("parseClassification", () => {
  it("parses a fully valid JSON response", () => {
    const result = parseClassification(validLlmResponse());
    expect(result).toMatchObject({
      intent: "community_recommendation",
      sentiment: "neutral",
      urgency: "medium",
      relevanceScore: 0.85,
      language: "English",
      useCase: "first_transfer",
    });
  });

  it("returns a sorted competitorMentions array", () => {
    const result = parseClassification(
      JSON.stringify({
        intent: "remittance_comparison",
        sentiment: "neutral",
        urgency: "low",
        relevanceScore: 0.7,
        competitorMentions: ["Remitly", "Wise"],
        language: "English",
        useCase: "rate_shopping",
      }),
    );
    expect(result.competitorMentions).toEqual(["Remitly", "Wise"]);
  });

  it("normalises known competitor aliases", () => {
    const result = parseClassification(
      JSON.stringify({
        intent: "remittance_comparison",
        sentiment: "neutral",
        urgency: "low",
        relevanceScore: 0.6,
        competitorMentions: ["transferwise", "WU"],
        language: "English",
        useCase: "other",
      }),
    );
    expect(result.competitorMentions).toContain("Wise");
    expect(result.competitorMentions).toContain("Western Union");
  });

  it("strips markdown fencing if present", () => {
    const fenced = `\`\`\`json\n${validLlmResponse()}\n\`\`\``;
    const result = parseClassification(fenced);
    expect(result).not.toBeUndefined();
    expect(result.intent).toBe("community_recommendation");
  });

  it("returns undefined for completely invalid JSON", () => {
    expect(parseClassification("not json at all")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseClassification("")).toBeUndefined();
  });

  it("falls back to 'other' intent for unknown intent values", () => {
    const result = parseClassification(
      JSON.stringify({ ...JSON.parse(validLlmResponse()), intent: "made_up_value" }),
    );
    expect(result.intent).toBe("other");
  });

  it("falls back to 'neutral' sentiment for unknown values", () => {
    const result = parseClassification(
      JSON.stringify({ ...JSON.parse(validLlmResponse()), sentiment: "ambivalent" }),
    );
    expect(result.sentiment).toBe("neutral");
  });

  it("clamps relevanceScore to [0, 1]", () => {
    const high = parseClassification(
      JSON.stringify({ ...JSON.parse(validLlmResponse()), relevanceScore: 1.5 }),
    );
    expect(high.relevanceScore).toBe(1);

    const low = parseClassification(
      JSON.stringify({ ...JSON.parse(validLlmResponse()), relevanceScore: -0.3 }),
    );
    expect(low.relevanceScore).toBe(0);
  });

  it("returns 0 for non-numeric relevanceScore", () => {
    const result = parseClassification(
      JSON.stringify({ ...JSON.parse(validLlmResponse()), relevanceScore: "high" }),
    );
    expect(result.relevanceScore).toBe(0);
  });

  it("returns an empty array for missing competitorMentions", () => {
    const payload = JSON.parse(validLlmResponse());
    delete payload.competitorMentions;
    const result = parseClassification(JSON.stringify(payload));
    expect(result.competitorMentions).toEqual([]);
  });

  it("deduplicates competitorMentions", () => {
    const result = parseClassification(
      JSON.stringify({
        ...JSON.parse(validLlmResponse()),
        competitorMentions: ["Wise", "wise", "Wise"],
      }),
    );
    expect(result.competitorMentions.filter((c) => c === "Wise")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// classifyThread
// ---------------------------------------------------------------------------

describe("classifyThread", () => {
  it("returns classification fields merged onto the thread", async () => {
    const thread = makeThread();
    const client = mockClient(validLlmResponse());
    const result = await classifyThread({ thread, client });

    expect(result.id).toBe(thread.id);
    expect(result.intent).toBe("community_recommendation");
    expect(result.sentiment).toBe("neutral");
    expect(result.urgency).toBe("medium");
    expect(result.relevanceScore).toBe(0.85);
    expect(result.language).toBe("English");
    expect(result.useCase).toBe("first_transfer");
    expect(result.classifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("preserves all original thread fields", async () => {
    const thread = makeThread();
    const client = mockClient();
    const result = await classifyThread({ thread, client });

    expect(result.title).toBe(thread.title);
    expect(result.subreddit).toBe(thread.subreddit);
    expect(result.matchedQueries).toEqual(thread.matchedQueries);
  });

  it("returns classifyError when Bedrock throws", async () => {
    const thread = makeThread();
    const client = {
      send: vi.fn().mockRejectedValue(new Error("network timeout")),
    };
    const result = await classifyThread({ thread, client });

    expect(result.classifyError).toContain("network timeout");
    expect(result.classifiedAt).toBeUndefined();
  });

  it("returns classifyError when LLM returns unparseable text", async () => {
    const thread = makeThread();
    const client = mockClient("This is not JSON at all");
    const result = await classifyThread({ thread, client });

    expect(result.classifyError).toContain("parse_failed");
  });

  it("calls Bedrock exactly once per thread", async () => {
    const thread = makeThread();
    const client = mockClient();
    await classifyThread({ thread, client });
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// runClassify
// ---------------------------------------------------------------------------

describe("runClassify", () => {
  it("classifies unclassified threads and writes back the artifact", async () => {
    const thread = makeThread();
    const root = makeTempRoot([thread]);
    const client = mockClient();

    await runClassify({ client, root });

    const saved = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "community-threads.json"), "utf8"),
    );

    expect(saved.data.threads[0].intent).toBe("community_recommendation");
    expect(saved.data.threads[0].classifiedAt).toBeDefined();
  });

  it("skips already-classified threads by default", async () => {
    const classified = makeThread({ classifiedAt: "2026-09-01T00:00:00.000Z", intent: "pricing_pain" });
    const root = makeTempRoot([classified]);
    const client = mockClient();

    await runClassify({ client, root });

    // send() should not have been called because the thread was already classified
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reclassifies when force=true", async () => {
    const classified = makeThread({ classifiedAt: "2026-09-01T00:00:00.000Z", intent: "pricing_pain" });
    const root = makeTempRoot([classified]);
    const client = mockClient();

    await runClassify({ client, root, force: true });

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("writes classifiedCount and draftReadyCount to artifact.data", async () => {
    const thread = makeThread(); // will get relevanceScore 0.85 from mockClient
    const root = makeTempRoot([thread]);
    const client = mockClient();

    await runClassify({ client, root });

    const saved = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "community-threads.json"), "utf8"),
    );

    expect(saved.data.classifiedCount).toBe(1);
    expect(saved.data.draftReadyCount).toBe(1); // 0.85 >= 0.7 threshold
  });

  it("writes classifiedAt timestamp to artifact.meta", async () => {
    const root = makeTempRoot([makeThread()]);
    const client = mockClient();

    await runClassify({ client, root });

    const saved = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "community-threads.json"), "utf8"),
    );

    expect(saved.meta.classifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("counts errors and stores classifyError on the failed thread", async () => {
    const thread = makeThread();
    const root = makeTempRoot([thread]);
    const client = {
      send: vi.fn().mockRejectedValue(new Error("throttled")),
    };

    await runClassify({ client, root, retryDelayMs: 0 });

    const saved = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "community-threads.json"), "utf8"),
    );

    expect(saved.data.classifyErrors).toBe(1);
    expect(saved.data.threads[0].classifyError).toContain("throttled");
  });

  it("throws when the artifact file does not exist", async () => {
    const root = mkdtempSync(join(tmpdir(), "xpat-classify-missing-"));
    // No artifact created
    await expect(runClassify({ root })).rejects.toThrow("community-threads artifact not found");
  });

  it("calls onProgress for each classified thread", async () => {
    const threads = [makeThread({ id: "t3_a" }), makeThread({ id: "t3_b" })];
    const root = makeTempRoot(threads);
    const client = mockClient();
    const progress = vi.fn();

    await runClassify({ client, root, onProgress: progress });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(1, 2, expect.any(Object));
    expect(progress).toHaveBeenCalledWith(2, 2, expect.any(Object));
  });

  it("preserves already-classified threads in the output", async () => {
    const done = makeThread({ id: "t3_done", classifiedAt: "2026-09-01T00:00:00.000Z", intent: "pricing_pain" });
    const pending = makeThread({ id: "t3_pending" });
    const root = makeTempRoot([done, pending]);
    const client = mockClient();

    await runClassify({ client, root });

    const saved = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "community-threads.json"), "utf8"),
    );

    const savedDone = saved.data.threads.find((t) => t.id === "t3_done");
    expect(savedDone.intent).toBe("pricing_pain"); // unchanged

    const savedPending = saved.data.threads.find((t) => t.id === "t3_pending");
    expect(savedPending.intent).toBe("community_recommendation"); // from mock
  });
});
