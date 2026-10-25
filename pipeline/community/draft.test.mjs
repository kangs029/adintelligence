import { describe, expect, it, vi } from "vitest";

import {
  FTC_DISCLOSURE,
  buildDraftPrompt,
  generateDraft,
  processDraft,
} from "./draft.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeThread(overrides = {}) {
  return {
    id: "t3_test01",
    title: "Best way to send money from US to India?",
    body: "I just moved to the US on H-1B and need to send money home every month.",
    subreddit: "nri",
    score: 42,
    numComments: 14,
    recency: "recent",
    intent: "community_recommendation",
    sentiment: "neutral",
    direction: "outbound",
    relevanceScore: 0.85,
    competitorMentions: [],
    useCase: "first_transfer",
    ...overrides,
  };
}

function mockClient(text) {
  return {
    send: vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [{ text }],
        },
      },
    }),
  };
}

function validDraft() {
  return "Totally understand the confusion when you first move here. When I was in the same spot, I tried a few services before settling on XPAT Money. The rates were consistently better than what I was seeing elsewhere and transfers usually landed within a day or two. Definitely worth trying for your monthly transfers home.";
}

// ---------------------------------------------------------------------------
// FTC_DISCLOSURE
// ---------------------------------------------------------------------------

describe("FTC_DISCLOSURE", () => {
  it("is a string (may be empty — disclosure removed by design)", () => {
    expect(typeof FTC_DISCLOSURE).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// buildDraftPrompt
// ---------------------------------------------------------------------------

describe("buildDraftPrompt", () => {
  it("returns system and user keys", () => {
    const prompt = buildDraftPrompt({ thread: makeThread() });
    expect(prompt).toHaveProperty("system");
    expect(prompt).toHaveProperty("user");
  });

  it("includes thread title in user prompt", () => {
    const thread = makeThread({ title: "How to send USD to INR cheaply?" });
    const { user } = buildDraftPrompt({ thread });
    expect(user).toContain("How to send USD to INR cheaply?");
  });

  it("includes subreddit in user prompt", () => {
    const { user } = buildDraftPrompt({ thread: makeThread({ subreddit: "h1b" }) });
    expect(user).toContain("r/h1b");
  });

  it("includes competitor mentions when present", () => {
    const thread = makeThread({ competitorMentions: ["Wise", "Remitly"] });
    const { user } = buildDraftPrompt({ thread });
    expect(user).toContain("Wise");
    expect(user).toContain("Remitly");
  });

  it("does not include competitor line when none mentioned", () => {
    const thread = makeThread({ competitorMentions: [] });
    const { user } = buildDraftPrompt({ thread });
    expect(user).not.toContain("competitors:");
  });

  it("includes US→India direction context for outbound", () => {
    const { user } = buildDraftPrompt({ thread: makeThread({ direction: "outbound" }) });
    expect(user).toContain("US TO India");
  });

  it("includes India→US direction context for inbound", () => {
    const { user } = buildDraftPrompt({ thread: makeThread({ direction: "inbound" }) });
    expect(user).toContain("India TO the US");
  });

  it("includes kb context when provided", () => {
    const { user } = buildDraftPrompt({
      thread: makeThread(),
      kbContext: "XPAT supports NRE and NRO accounts.",
    });
    expect(user).toContain("XPAT supports NRE and NRO accounts.");
  });

  it("says no kb context when not provided", () => {
    const { user } = buildDraftPrompt({ thread: makeThread(), kbContext: null });
    expect(user).toContain("No knowledge base context available");
  });

  it("system prompt includes persona and hard rules", () => {
    const { system } = buildDraftPrompt({ thread: makeThread() });
    expect(system).toContain("H-1B");
    expect(system).toContain("XPAT Money");
    expect(system).toContain("HARD RULES");
  });

  it("includes intent-specific angle in system prompt", () => {
    const thread = makeThread({ intent: "pricing_pain" });
    const { system } = buildDraftPrompt({ thread });
    expect(system).toContain("pricing_pain");
  });

  it("truncates long body to prevent oversized prompts", () => {
    const thread = makeThread({ body: "x".repeat(5000) });
    const { user } = buildDraftPrompt({ thread });
    expect(user.length).toBeLessThan(6000);
  });
});

// ---------------------------------------------------------------------------
// processDraft
// ---------------------------------------------------------------------------

describe("processDraft", () => {
  it("returns valid:true and clean draft for a good draft", () => {
    const result = processDraft(validDraft());
    expect(result.valid).toBe(true);
    expect(result.draft).toBe(validDraft().trim());
  });

  it("returns valid:false for empty string", () => {
    expect(processDraft("").valid).toBe(false);
  });

  it("returns valid:false for very short draft", () => {
    expect(processDraft("Try XPAT.").valid).toBe(false);
    expect(processDraft("Try XPAT.").reason).toBe("draft_too_short");
  });

  it("returns valid:false for draft over 300 words", () => {
    const longDraft = ("XPAT is great. " + "word ".repeat(300));
    const result = processDraft(longDraft);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("draft_too_long");
  });

  it("returns valid:false when XPAT is not mentioned", () => {
    const noXpat = "Just use Wise, it has great rates and fast transfers to India. I have been using it for two years and never had a problem. The app is smooth and support is responsive.";
    const result = processDraft(noXpat);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("xpat_not_mentioned");
  });

  it("preserves the draft text in the output", () => {
    const result = processDraft(validDraft());
    expect(result.draft).toContain("XPAT");
  });
});

// ---------------------------------------------------------------------------
// generateDraft
// ---------------------------------------------------------------------------

describe("generateDraft", () => {
  it("returns a valid draft for a valid thread", async () => {
    const client = mockClient(validDraft());
    const result = await generateDraft({ thread: makeThread(), client });

    expect(result.error).toBeUndefined();
    expect(result.draft).toBe(validDraft().trim());
  });

  it("includes intent and direction in the result", async () => {
    const client = mockClient(validDraft());
    const result = await generateDraft({
      thread: makeThread({ intent: "community_recommendation", direction: "outbound" }),
      client,
    });

    expect(result.intent).toBe("community_recommendation");
    expect(result.direction).toBe("outbound");
  });

  it("returns kbContextUsed:true when stub KB returns context", async () => {
    const client = mockClient(validDraft());
    const result = await generateDraft({ thread: makeThread(), client });
    // Stub always returns context
    expect(result.kbContextUsed).toBe(true);
  });

  it("returns error when Bedrock throws", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("throttled")) };
    const result = await generateDraft({ thread: makeThread(), client, maxRetries: 0 });
    expect(result.error).toContain("throttled");
  });

  it("retries on validation failure and returns error after max retries", async () => {
    // Returns draft without XPAT — fails validation every time
    const noXpatDraft = "Just use Wise, it has great rates. Been using it for two years with no issues. Customer service is responsive and the app works well for regular transfers to India.";
    const client = mockClient(noXpatDraft);
    const result = await generateDraft({ thread: makeThread(), client, maxRetries: 1 });
    expect(result.error).toContain("validation_failed");
    expect(client.send).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("calls Bedrock with the correct model ID", async () => {
    const client = mockClient(validDraft());
    await generateDraft({ thread: makeThread(), client });
    const callArg = client.send.mock.calls[0][0];
    expect(callArg.input.modelId).toContain("claude-sonnet");
  });

  it("works for all intent types without throwing", async () => {
    const intents = [
      "remittance_comparison", "pricing_pain", "speed_concern",
      "trust_issue", "new_to_us", "community_recommendation",
      "competitor_complaint", "other",
    ];

    for (const intent of intents) {
      const client = mockClient(validDraft());
      const result = await generateDraft({
        thread: makeThread({ intent }),
        client,
        maxRetries: 0,
      });
      expect(result.error).toBeUndefined();
    }
  });
});
