import { describe, expect, it } from "vitest";
import { filterThreads, shouldKeepThread } from "./filter.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thread(overrides = {}) {
  return {
    id: "t3_test",
    title: "Test post",
    body: "",
    subreddit: "nri",
    score: 5,
    numComments: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldKeepThread
// ---------------------------------------------------------------------------

describe("shouldKeepThread", () => {
  // --- US diaspora subreddits always pass ---

  it("keeps r/h1b posts regardless of content", () => {
    const result = shouldKeepThread(thread({ subreddit: "h1b", title: "Anything" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_diaspora_subreddit");
  });

  it("keeps r/ABCDesis posts regardless of content (case-insensitive)", () => {
    const result = shouldKeepThread(thread({ subreddit: "ABCDesis", title: "Anything" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_diaspora_subreddit");
  });

  it("keeps r/immigration posts regardless of content", () => {
    const result = shouldKeepThread(thread({ subreddit: "immigration", title: "Moving to India" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_diaspora_subreddit");
  });

  // --- US context signals ---

  it("keeps post mentioning H-1B", () => {
    const result = shouldKeepThread(thread({ title: "H-1B visa holder sending money to India" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning H1B (no dash)", () => {
    const result = shouldKeepThread(thread({ title: "H1B approved, now want to send money home" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning USD", () => {
    const result = shouldKeepThread(thread({ title: "Best rate for USD to INR transfer?" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning Green Card", () => {
    const result = shouldKeepThread(thread({ title: "Got my Green Card, now what about NRE account?" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning 'from the US'", () => {
    const result = shouldKeepThread(thread({ title: "Sending money from the US to India" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning 'in the United States'", () => {
    const result = shouldKeepThread(thread({ body: "I have been living in the United States for 3 years" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning 'US to India'", () => {
    const result = shouldKeepThread(thread({ title: "US to India transfer options?" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning Bay Area", () => {
    const result = shouldKeepThread(thread({ body: "I live in Bay Area and need to send money home" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post mentioning OPT", () => {
    const result = shouldKeepThread(thread({ title: "On OPT, can I still use Wise to send money?" }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  it("keeps post with US context even if it also has inbound signals", () => {
    // US context takes priority over inbound signal
    const result = shouldKeepThread(thread({
      title: "H-1B holder — want to transfer from India to US too",
    }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("us_context_signal");
  });

  // --- Inbound signals — India→non-US should be dropped ---

  it("drops post about India to UK transfer with no US context", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "Best way to transfer money India to UK?",
      body: "",
    }));
    expect(result.keep).toBe(false);
    expect(result.reason).toBe("non_us_corridor");
  });

  it("drops post about India to Canada transfer", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "Sending money from India to Canada — any suggestions?",
      body: "",
    }));
    expect(result.keep).toBe(false);
    expect(result.reason).toBe("non_us_corridor");
  });

  it("drops post about India to UAE transfer", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "India to Dubai transfer, which service is best?",
      body: "",
    }));
    expect(result.keep).toBe(false);
    expect(result.reason).toBe("non_us_corridor");
  });

  it("drops post about India to Australia transfer", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "Remitting funds from India to Australia",
      body: "",
    }));
    expect(result.keep).toBe(false);
    expect(result.reason).toBe("non_us_corridor");
  });

  // --- India→US should be KEPT ---

  it("keeps post about sending money from India to US", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "How to send money from India to USA?",
      body: "",
    }));
    expect(result.keep).toBe(true);
  });

  it("keeps post about India to US transfer (relevant corridor)", () => {
    const result = shouldKeepThread(thread({
      subreddit: "IndiaInvestments",
      title: "India to US wire transfer — best options?",
      body: "",
    }));
    expect(result.keep).toBe(true);
  });

  // --- Direction unclear → keep ---

  it("keeps post with no direction signal (let Haiku decide)", () => {
    const result = shouldKeepThread(thread({
      subreddit: "nri",
      title: "Best remittance service in 2026?",
      body: "Looking for low fees and good exchange rates.",
    }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("direction_unclear_keep");
  });

  it("keeps post about Wise vs Remitly comparison with no direction", () => {
    const result = shouldKeepThread(thread({
      subreddit: "personalfinance",
      title: "Wise vs Remitly for India transfers — which is better?",
      body: "",
    }));
    expect(result.keep).toBe(true);
    expect(result.reason).toBe("direction_unclear_keep");
  });

  // --- Zero engagement is NOT a filter criterion ---

  it("keeps post with 0 score and 0 comments", () => {
    const result = shouldKeepThread(thread({
      subreddit: "h1b",
      title: "Any suggestions?",
      score: 0,
      numComments: 0,
    }));
    expect(result.keep).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterThreads (batch)
// ---------------------------------------------------------------------------

describe("filterThreads", () => {
  it("returns all threads when all pass", () => {
    const threads = [
      thread({ subreddit: "h1b", title: "H1B money transfer" }),
      thread({ title: "Sending USD to India" }),
    ];
    const result = filterThreads(threads);
    expect(result.threads).toHaveLength(2);
    expect(result.dropped).toBe(0);
  });

  it("drops inbound-only threads and counts them", () => {
    const threads = [
      thread({ subreddit: "h1b", title: "H1B transfer" }),               // keep — US diaspora
      thread({ subreddit: "nri", title: "India to UK remittance help" }), // drop — non-US corridor
      thread({ subreddit: "nri", title: "Sending money India to Canada" }), // drop — non-US corridor
    ];
    const result = filterThreads(threads);
    expect(result.threads).toHaveLength(1);
    expect(result.dropped).toBe(2);
    expect(result.summary.non_us_corridor).toBe(2);
  });

  it("keeps India to US posts (relevant corridor)", () => {
    const threads = [
      thread({ subreddit: "nri", title: "How to send money from India to USA?" }),
    ];
    const result = filterThreads(threads);
    expect(result.threads).toHaveLength(1);
    expect(result.dropped).toBe(0);
  });

  it("returns empty array when all threads are non-US corridors", () => {
    const threads = [
      thread({ subreddit: "nri", title: "India to UK transfer" }),
      thread({ subreddit: "nri", title: "India to Australia remittance" }),
    ];
    const result = filterThreads(threads);
    expect(result.threads).toHaveLength(0);
    expect(result.dropped).toBe(2);
  });

  it("returns summary with reason counts", () => {
    const threads = [
      thread({ subreddit: "nri", title: "India to UAE money transfer" }),
      thread({ subreddit: "nri", title: "Sending from India to Canada" }),
    ];
    const result = filterThreads(threads);
    expect(result.summary.non_us_corridor).toBe(2);
  });
});
