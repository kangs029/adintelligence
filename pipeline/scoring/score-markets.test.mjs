import { describe, expect, it } from "vitest";

import {
  scoreAndTierMarketRecord,
  scoreMarketRecord,
} from "./score-markets.mjs";

const baseMarket = {
  geoid: "31000US41940",
  name: "San Jose-Sunnyvale-Santa Clara",
  state: "CA",
  states: ["CA"],
  lat: 36.9084718,
  lng: -121.3713721,
  population: { asianIndian: 202_245, moe: 5_199, total: 1_969_337 },
  concentration: { localSharePct: 10.2697, usSharePct: 4.3735, multipleOfUS: 7.4362 },
  income: { medianHousehold: 162_111, moe: 1_963 },
  moeReliability: "high",
};

describe("pipeline scoring", () => {
  it("scores markets while treating missing optional signals as zero", () => {
    const scored = scoreAndTierMarketRecord(baseMarket);

    expect(scored.score).toBeGreaterThan(50);
    expect(scored.tier).toBe(2);
    expect(scored).not.toHaveProperty("anchorSummary");
    expect(scored).not.toHaveProperty("employmentProxy");
    expect(scored).not.toHaveProperty("students");
  });

  it("uses richer grounded signals when they are present", () => {
    const result = scoreMarketRecord({
      ...baseMarket,
      anchorSummary: { temples: 8, groceries: 14, cricket: 3, theaters: 3, per10kAI: 1.3845 },
      employmentProxy: { lcaFilings: 8_000, topEmployers: ["Adobe", "Google"] },
      students: { activeIndianStudents: 8_000 },
    });

    expect(result.score).toBeGreaterThan(80);
    expect(result.weighted.employment).toBe(15);
  });
});
