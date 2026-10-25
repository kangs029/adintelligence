import { describe, expect, it } from "vitest";

import corridorContextArtifact from "@/data/artifacts/corridor-context.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import { corridorContextForMarket } from "./corridor";

const markets = marketsArtifact.data.markets;
const nationalAsianIndian = marketsArtifact.data.summary.nationalAsianIndian;

function contextFor(geoid: string) {
  const market = markets.find((candidate) => candidate.geoid === geoid);
  if (!market) throw new Error(`Missing market ${geoid}`);

  return corridorContextForMarket({
    context: corridorContextArtifact.data,
    market,
    nationalAsianIndian,
  });
}

describe("corridorContextForMarket", () => {
  it("uses billions only for estimates at or above one billion", () => {
    expect(contextFor("31000US41940").estimateLabel).toMatch(/^\$\d+\.\dB a year$/u);
  });

  it("formats sub-billion estimates as rounded millions", () => {
    expect(contextFor("31000US14460").estimateLabel).toBe("$900M a year");
    expect(contextFor("31000US26900").estimateLabel).toBe("$200M a year");
  });

  it("bounds very small estimates instead of rounding them up", () => {
    expect(contextFor("31000US17420").estimateLabel).toBe("<$10M a year");
  });
});
