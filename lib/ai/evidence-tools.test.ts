import { describe, expect, it } from "vitest";

import {
  lookupCompetitorPositioning,
  lookupMarket,
  lookupReviewThemes,
  summarizeFxHistory,
} from "./evidence-tools";

describe("evidence tools (read-only, WS2)", () => {
  it("getMarket resolves by metro name with grounded facts and a source", () => {
    const result = lookupMarket("Dallas");
    expect(result.found).toBe(true);
    if (!result.found) {
      return;
    }
    expect(result.geoid).toBe("31000US19100");
    expect(result.tier).toBe(1);
    expect(result.population.asianIndian).toBeGreaterThan(0);
    expect(result.rankByScore).toBeGreaterThan(0);
    expect(result.source.family).toBeTruthy();
    expect(result.source.asOf).toBeTruthy();
  });

  it("getMarket resolves by geoid", () => {
    const result = lookupMarket("31000US19100");
    expect(result.found).toBe(true);
    if (!result.found) {
      return;
    }
    expect(result.name).toContain("Dallas");
  });

  it("getMarket returns found:false for an unknown market", () => {
    const result = lookupMarket("Atlantis");
    expect(result.found).toBe(false);
    expect(result.source.family).toBeTruthy();
  });

  it("getCompetitorPositioning filters by competitor and carries a source", () => {
    const result = lookupCompetitorPositioning("Remitly");
    expect(result.count).toBeGreaterThan(0);
    expect(
      result.profiles.every((profile) => /remitly/i.test(profile.competitor)),
    ).toBe(true);
    expect(result.source.family).toBeTruthy();
  });

  it("getCompetitorPositioning returns every profile when unfiltered", () => {
    const result = lookupCompetitorPositioning();
    expect(result.count).toBeGreaterThan(1);
    expect(result.filteredBy).toBeNull();
  });

  it("getReviewThemes returns themes for a known competitor", () => {
    const result = lookupReviewThemes("Xpat");
    expect(result.found).toBe(true);
    if (!result.found) {
      return;
    }
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups[0].themes.length).toBeGreaterThan(0);
    expect(result.groups[0].themes[0].theme).toBeTruthy();
    expect(result.source.family).toBeTruthy();
  });

  it("getReviewThemes returns found:false for an uncovered competitor", () => {
    const result = lookupReviewThemes("NotARealBrand");
    expect(result.found).toBe(false);
  });

  it("getFxHistory summarizes USD to INR with a bounded sampled series", () => {
    const result = summarizeFxHistory();
    expect(result.base).toBe("USD");
    expect(result.target).toBe("INR");
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.series.length).toBeLessThanOrEqual(20);
    expect(result.windowLow?.rate).toBeLessThanOrEqual(
      result.windowHigh?.rate ?? Number.POSITIVE_INFINITY,
    );
    expect(result.source.family).toBeTruthy();
  });
});
