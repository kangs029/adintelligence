import { describe, expect, it } from "vitest";

// Bind the sanitizer tests to the exact production gates: the copy guardrail
// that scans committed artifacts and the claim contract used across the app.
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { validateClaims } from "@/lib/claims/contract";
import { bannedPerformanceClaims } from "@/lib/claims/banned";
import { createLineSanitizer, sanitizeBrief } from "./brief-sanitizer";

function copyViolations(text: string) {
  return findCopyViolations(text, "brief.json") as Array<{ rule: string }>;
}

describe("sanitizeBrief", () => {
  it("strips em and en dashes", () => {
    const result = sanitizeBrief("Grocery corridors \u2014 with temples \u2013 nearby.");
    expect(result.text).not.toMatch(/[\u2013\u2014]/u);
    expect(copyViolations(result.text)).toHaveLength(0);
    expect(result.clean).toBe(false);
  });

  it("neutralizes every banned performance claim on unguarded lines", () => {
    for (const claim of bannedPerformanceClaims) {
      const line = `This plan will improve ${claim.term} across the market.`;
      const result = sanitizeBrief(line);

      expect(copyViolations(result.text)).toHaveLength(0);
      expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
      expect(result.redactions).toContain(claim.term);
    }
  });

  it("leaves metrics intact when the line already carries missing-data context", () => {
    const line = "This does not prove ROI, CAC, or conversion rate for the market.";
    const result = sanitizeBrief(line);

    expect(result.text).toBe(line);
    expect(result.clean).toBe(true);
    expect(copyViolations(result.text)).toHaveLength(0);
  });

  it("holds the anchor evidence boundary", () => {
    const line = "The temple customer counts show strong local demand.";
    const result = sanitizeBrief(line);

    expect(result.text).toContain("community presence evidence");
    expect(result.text).not.toMatch(/customer counts?/iu);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
  });

  it("holds the workforce proxy boundary", () => {
    const line = "We target H-1B workers directly in this market.";
    const result = sanitizeBrief(line);

    expect(result.text).toMatch(/employer\/workforce proxy/u);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
  });

  it("strips raw environment-variable-shaped tokens", () => {
    const result = sanitizeBrief("Set VERCEL_OIDC_TOKEN before running the brief.");
    expect(result.text).not.toMatch(/\b[A-Z]{3,}_[A-Z_]{3,}\b/u);
    expect(copyViolations(result.text)).toHaveLength(0);
  });

  it("cleans a dense adversarial brief end to end", () => {
    const brief = [
      "## Why this market",
      "The channel plan will lift conversion rate and lower CAC fast.",
      "Expect strong ROI and LTV once we scale spend here.",
      "Temple customer counts prove first transfer volume immediately \u2014 guaranteed.",
      "We can read individual identity and visa status from the ad delivery.",
    ].join("\n");

    const result = sanitizeBrief(brief);
    expect(copyViolations(result.text)).toHaveLength(0);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
    expect(result.text).not.toMatch(/[\u2013\u2014]/u);
  });
});

describe("createLineSanitizer", () => {
  it("neutralizes a banned term split across streamed deltas", () => {
    const sanitizer = createLineSanitizer();
    let out = "";
    out += sanitizer.push("Our ad sp");
    out += sanitizer.push("end plan is aggressive\n");
    out += sanitizer.flush();

    expect(out).not.toMatch(/\bspend\b/iu);
    expect(out).toContain("budget band");
    expect(copyViolations(out)).toHaveLength(0);
    expect(sanitizer.redactions).toContain("spend");
  });

  it("matches whole-text sanitize when streamed line by line", () => {
    const brief = [
      "## Plan",
      "Lower CAC and prove ROI now.",
      "This does not prove conversion rate.",
      "Temple customer counts are demand.",
    ].join("\n");

    const sanitizer = createLineSanitizer();
    let streamed = "";
    for (const char of brief) {
      streamed += sanitizer.push(char);
    }
    streamed += sanitizer.flush();

    expect(streamed).toBe(sanitizeBrief(brief).text);
    expect(copyViolations(streamed)).toHaveLength(0);
  });
});

describe("cross-line claim splits", () => {
  it("neutralizes a banned phrase split across a line break", () => {
    const brief = "This channel plan lifts conversion\nrate across the market.";
    const result = sanitizeBrief(brief);

    expect(result.text).not.toMatch(/conversion\s+rate/iu);
    expect(copyViolations(result.text)).toHaveLength(0);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
    expect(result.redactions).toContain("conversion rate");
  });

  it("neutralizes the anchor phrase split across a line break", () => {
    const brief = "Temple customer\ncounts prove local demand.";
    const result = sanitizeBrief(brief);

    expect(result.text).not.toMatch(/customer\s+counts?/iu);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
  });

  it("neutralizes a longer phrase split across a line break", () => {
    const brief = "We can read the delivery of\na specific ad here.";
    const result = sanitizeBrief(brief);

    expect(result.text).not.toMatch(/delivery of\s+a specific ad/iu);
    expect(copyViolations(result.text)).toHaveLength(0);
    expect(validateClaims({ text: result.text }, "copy")).toHaveLength(0);
  });

  it("catches a cross-line split while streaming section blocks", () => {
    const sanitizer = createLineSanitizer();
    let out = "";
    for (const chunk of ["We lift conversion\n", "rate fast.\n\n", "Next section stays clean."]) {
      out += sanitizer.push(chunk);
    }
    out += sanitizer.flush();

    expect(out).not.toMatch(/conversion\s+rate/iu);
    expect(copyViolations(out)).toHaveLength(0);
    expect(sanitizer.redactions).toContain("conversion rate");
  });
});
