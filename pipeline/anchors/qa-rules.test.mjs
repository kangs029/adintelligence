import { describe, expect, it } from "vitest";

import { evaluateAnchorCandidate } from "./qa-rules.mjs";

describe("anchor QA rules", () => {
  it("excludes locality-name leakage such as Madras, OR groceries", () => {
    expect(
      evaluateAnchorCandidate({
        kind: "grocery",
        name: "Madras Market",
        tags: {
          shop: "supermarket",
          "addr:city": "Madras",
          "addr:state": "OR",
        },
      }),
    ).toEqual({
      exclude: true,
      qaFlags: ["locality-name-leakage"],
    });
  });

  it("excludes generic grocery matches without South Asian evidence", () => {
    expect(
      evaluateAnchorCandidate({
        kind: "grocery",
        name: "Indian Creek Grocery",
        tags: { shop: "convenience" },
      }),
    ).toEqual({
      exclude: true,
      qaFlags: ["generic-grocery-match"],
    });
  });

  it("excludes non-Dharmic worship matches", () => {
    expect(
      evaluateAnchorCandidate({
        kind: "temple",
        name: "India Pentecostal Church",
        tags: {
          amenity: "place_of_worship",
          religion: "christian",
        },
      }),
    ).toEqual({
      exclude: true,
      qaFlags: ["non-dharmic-worship"],
    });
  });

  it("keeps reviewable but included anchors with flags", () => {
    expect(
      evaluateAnchorCandidate({
        kind: "grocery",
        name: "Desi Bazaar",
        tags: {
          shop: "supermarket",
          name: "Desi Bazaar",
        },
      }),
    ).toEqual({
      exclude: false,
      qaFlags: ["name-match"],
    });
  });
});
