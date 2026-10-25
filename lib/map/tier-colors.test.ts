import { describe, expect, it } from "vitest";

import {
  MARKET_TIER_COLOR_EXPRESSION,
  MARKET_TIER_RADIUS_EXPRESSION,
  MARKET_TIER_STROKE_COLOR_EXPRESSION,
  MARKET_TIER_STROKE_WIDTH_EXPRESSION,
  TIER_COLORS,
  tierLegendItems,
} from "./tier-colors";

describe("tier map colors", () => {
  it("uses the design-token colors as the single source of truth", () => {
    expect(TIER_COLORS).toEqual({
      1: "#2DD4BF",
      2: "#1FA396",
      3: "#177A72",
      4: "#3A4148",
    });

    expect(MARKET_TIER_COLOR_EXPRESSION).toEqual([
      "match",
      ["get", "tier"],
      1,
      TIER_COLORS[1],
      2,
      TIER_COLORS[2],
      3,
      TIER_COLORS[3],
      TIER_COLORS[4],
    ]);
    expect(tierLegendItems.map((item) => item.color)).toEqual([
      TIER_COLORS[1],
      TIER_COLORS[2],
      TIER_COLORS[3],
      TIER_COLORS[4],
    ]);
  });

  it("keeps discovery dots visible without stealing Tier 1 hierarchy", () => {
    expect(MARKET_TIER_STROKE_COLOR_EXPRESSION).toEqual([
      "match",
      ["get", "tier"],
      1,
      "#D6FFF9",
      3,
      "rgba(45,212,191,0.4)",
      4,
      "#6C7280",
      "#0B0C0F",
    ]);
    expect(MARKET_TIER_STROKE_WIDTH_EXPRESSION).toEqual([
      "match",
      ["get", "tier"],
      1,
      2.25,
      3,
      1,
      4,
      1,
      1.25,
    ]);
  });

  it("grows small market dots as the user zooms into a region", () => {
    expect(MARKET_TIER_RADIUS_EXPRESSION).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      3,
      ["max", 3.5, ["*", ["get", "markerRadius"], 0.85]],
      6,
      ["get", "markerRadius"],
      9,
      ["*", ["get", "markerRadius"], 1.6],
    ]);
  });
});
