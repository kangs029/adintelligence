import { describe, expect, it } from "vitest";

import { validateClaims } from "./contract";

describe("validateClaims", () => {
  it("rejects public-data performance claims with nested paths", () => {
    const violations = validateClaims(
      {
        dossier: {
          channel: {
            claim: "Public competitor ads show San Jose CAC will be lower than Dallas.",
          },
        },
      },
      "dossier",
    );

    expect(violations).toContainEqual({
      path: "$.dossier.channel.claim",
      rule: "public-data-performance-claim",
      term: "CAC",
    });
  });

  it("allows banned metric names only inside connector-needed or missing-data copy", () => {
    expect(
      validateClaims(
        {
          connector: "Connector-needed: CAC, spend, and conversion rate require Xpat exports.",
        },
        "copy",
      ),
    ).toEqual([]);

    expect(
      validateClaims(
        {
          evidence: "Public proof link captured; do not infer spend or conversion from this row.",
        },
        "copy",
      ),
    ).toEqual([]);
  });

  it("rejects team-stated KYC/ROI context outside connector-needed schema fields", () => {
    expect(
      validateClaims(
        {
          ask: "Locates where the ~40% KYC drop-off concentrates by market and channel, the highest-ROI lever your team identified.",
        },
        "dossier",
      ).map((violation) => violation.term),
    ).toContain("ROI");
  });

  it("rejects corridor evidence promoted into definite local-market claims", () => {
    expect(
      validateClaims(
        {
          recommendation: "Corridor-wide review pain proves San Jose customers will switch to Xpat.",
        },
        "dossier",
      ),
    ).toContainEqual({
      path: "$.recommendation",
      rule: "public-data-local-claim",
      term: "corridor evidence",
    });

    expect(
      validateClaims(
        {
          recommendation: "Corridor-wide review pain suggests a hypothesis to test in San Jose.",
        },
        "dossier",
      ),
    ).toEqual([]);
  });

  it("rejects first-transfer and repeat-transfer claims derived from public evidence", () => {
    const violations = validateClaims(
      {
        experiment: "Reddit pain threads should lift first transfer and repeat transfer in San Jose.",
      },
      "dossier",
    );

    expect(violations.map((violation) => violation.term)).toEqual([
      "first transfer",
      "repeat transfer",
    ]);
  });

  it("requires benchmark language to name a reference market", () => {
    expect(validateClaims({ why: "Benchmark says WhatsApp should work here." }, "dossier")).toContainEqual({
      path: "$.why",
      rule: "benchmark-reference-required",
      term: "benchmark",
    });

    expect(
      validateClaims(
        { why: "Benchmark reference market: Dallas playbook, not generic advice." },
        "dossier",
      ),
    ).toEqual([]);
  });

  it("requires budget and numeric experiment estimates to be labeled estimated", () => {
    expect(validateClaims({ budget: "Test budget $1,000 for two weeks." }, "dossier")).toContainEqual({
      path: "$.budget",
      rule: "estimate-label-required",
      term: "budget",
    });

    expect(
      validateClaims({ budget: "Estimated test budget band: $500 to $1,000." }, "dossier"),
    ).toEqual([]);
  });

  it("enforces LCA and anchor evidence language boundaries", () => {
    const violations = validateClaims(
      {
        anchors: "Temple and grocery counts prove customer counts in this market.",
        employment: "Target H-1B workers from LCA employer filings.",
      },
      "dossier",
    );

    expect(violations).toContainEqual({
      path: "$.anchors",
      rule: "anchor-evidence-boundary",
      term: "customer counts",
    });
    expect(violations).toContainEqual({
      path: "$.employment",
      rule: "workforce-proxy-boundary",
      term: "H-1B",
    });

    expect(
      validateClaims(
        {
          anchors: "Temples and groceries are community presence evidence.",
          employment: "LCA filings are an employer/workforce proxy.",
        },
        "dossier",
      ),
    ).toEqual([]);
  });
});
