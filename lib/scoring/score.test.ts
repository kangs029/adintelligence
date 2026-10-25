import { describe, expect, it } from "vitest";

import type { Market } from "@/lib/data/markets";
import { scoreMarket } from "./score";

const baseMarket: Market = {
  geoid: "31000US41940",
  name: "San Jose-Sunnyvale-Santa Clara",
  state: "CA",
  states: ["CA"],
  lat: 37.2207774,
  lng: -121.6906224,
  population: { asianIndian: 202_245, moe: 5_199, total: 3_115_386 },
  concentration: { localSharePct: 6.4918, usSharePct: 4.0625, multipleOfUS: 4.435 },
  income: { medianHousehold: 167_674, moe: 2_412 },
  moeReliability: "high",
  anchorSummary: {
    temples: 8,
    groceries: 14,
    cricket: 3,
    theaters: 3,
    per10kAI: 1.3845,
  },
  employmentProxy: { lcaFilings: 8_000, topEmployers: ["Adobe", "Google"] },
  students: { activeIndianStudents: 8_000 },
};

describe("scoreMarket", () => {
  it("returns a weighted 0-100 score with inspectable components", () => {
    const result = scoreMarket(baseMarket);

    expect(result.score).toBeGreaterThan(80);
    expect(result.score).toBeLessThan(82);
    expect(result.components).toMatchObject({
      population: expect.any(Number),
      concentration: expect.any(Number),
      anchors: expect.any(Number),
      employment: 1,
      students: expect.any(Number),
    });
    expect(result.weighted).toMatchObject({
      population: expect.any(Number),
      concentration: expect.any(Number),
      anchors: expect.any(Number),
      employment: 15,
      students: expect.any(Number),
    });
  });

  it("caps individual components so outliers do not dominate", () => {
    const result = scoreMarket({
      ...baseMarket,
      population: { ...baseMarket.population, asianIndian: 900_000 },
      concentration: { ...baseMarket.concentration, multipleOfUS: 20 },
      anchorSummary: { ...baseMarket.anchorSummary, per10kAI: 50 },
      employmentProxy: { lcaFilings: 1_000_000, topEmployers: [] },
      students: { activeIndianStudents: 100_000 },
    });

    expect(result.score).toBe(100);
    expect(Object.values(result.components)).toEqual([1, 1, 1, 1, 1]);
  });
});
