import { describe, expect, it } from "vitest";

import type { Market } from "@/lib/data/markets";
import { scoreAndTierMarket, tierMarket } from "./tiers";

function market(overrides: Partial<Market>): Market {
  return {
    geoid: "31000US00000",
    name: "Fixture",
    state: "CA",
    states: ["CA"],
    lat: 0,
    lng: 0,
    population: { asianIndian: 50_000, moe: 2_000, total: 1_000_000 },
    concentration: { localSharePct: 5, usSharePct: 1, multipleOfUS: 2 },
    moeReliability: "high",
    anchorSummary: { temples: 2, groceries: 3, cricket: 0, theaters: 0, per10kAI: 1 },
    employmentProxy: { lcaFilings: 500, topEmployers: [] },
    students: { activeIndianStudents: 2_500 },
    ...overrides,
  };
}

const demoMarkets: Market[] = [
  market({
    geoid: "31000US41940",
    name: "San Jose-Sunnyvale-Santa Clara",
    population: { asianIndian: 202_245, moe: 5_199, total: 3_115_386 },
    concentration: { localSharePct: 6.4918, usSharePct: 4.0625, multipleOfUS: 4.435 },
    anchorSummary: { temples: 8, groceries: 14, cricket: 3, theaters: 3, per10kAI: 1.3845 },
    employmentProxy: { lcaFilings: 8_000, topEmployers: ["Adobe", "Google"] },
    students: { activeIndianStudents: 8_000 },
  }),
  market({
    geoid: "31000US41860",
    name: "San Francisco-Oakland-Berkeley",
    population: { asianIndian: 210_000, moe: 6_000, total: 4_600_000 },
    concentration: { localSharePct: 4.5652, usSharePct: 4.2182, multipleOfUS: 3.2 },
    anchorSummary: { temples: 7, groceries: 12, cricket: 3, theaters: 3, per10kAI: 1.1905 },
    employmentProxy: { lcaFilings: 7_000, topEmployers: ["Meta", "Salesforce"] },
    students: { activeIndianStudents: 9_000 },
  }),
  market({
    geoid: "31000US35620",
    name: "New York-Newark-Jersey City",
    state: "NY",
    states: ["NY", "NJ", "PA"],
    population: { asianIndian: 450_000, moe: 10_000, total: 19_600_000 },
    concentration: { localSharePct: 2.2959, usSharePct: 9.0391, multipleOfUS: 2.1 },
    anchorSummary: { temples: 20, groceries: 42, cricket: 8, theaters: 10, per10kAI: 1.7778 },
    employmentProxy: { lcaFilings: 10_000, topEmployers: ["JPMorgan Chase", "Google"] },
    students: { activeIndianStudents: 15_000 },
  }),
  market({
    geoid: "31000US19100",
    name: "Dallas-Fort Worth-Arlington",
    state: "TX",
    states: ["TX"],
    population: { asianIndian: 200_000, moe: 5_500, total: 8_100_000 },
    concentration: { localSharePct: 2.4691, usSharePct: 4.0174, multipleOfUS: 2 },
    anchorSummary: { temples: 9, groceries: 15, cricket: 3, theaters: 3, per10kAI: 1.5 },
    employmentProxy: { lcaFilings: 2_500, topEmployers: ["Infosys", "Capital One"] },
    students: { activeIndianStudents: 8_000 },
  }),
  market({
    geoid: "31000US19820",
    name: "Detroit-Warren-Dearborn",
    state: "MI",
    states: ["MI"],
    population: { asianIndian: 75_000, moe: 4_500, total: 4_300_000 },
    concentration: { localSharePct: 1.7442, usSharePct: 1.5065, multipleOfUS: 1.5 },
    anchorSummary: { temples: 3, groceries: 4, cricket: 1, theaters: 0, per10kAI: 1.0667 },
    employmentProxy: { lcaFilings: 500, topEmployers: ["Ford", "GM"] },
    students: { activeIndianStudents: 2_000 },
  }),
  market({
    geoid: "31000US26900",
    name: "Indianapolis-Carmel-Greenwood",
    state: "IN",
    states: ["IN"],
    population: { asianIndian: 25_000, moe: 2_500, total: 2_200_000 },
    concentration: { localSharePct: 1.1364, usSharePct: 0.5022, multipleOfUS: 1.1 },
    anchorSummary: { temples: 1, groceries: 2, cricket: 0, theaters: 0, per10kAI: 1.2 },
    employmentProxy: { lcaFilings: 20, topEmployers: ["Eli Lilly"] },
    students: { activeIndianStudents: 1_000 },
  }),
];

describe("tierMarket", () => {
  it("requires high reliability and at least five anchors for Tier 1", () => {
    expect(tierMarket({ score: 90, market: market({ moeReliability: "medium" }) })).toBe(2);
    expect(
      tierMarket({
        score: 90,
        market: market({
          anchorSummary: { temples: 1, groceries: 1, cricket: 0, theaters: 0, per10kAI: 0.4 },
        }),
      }),
    ).toBe(2);
  });

  it("freezes demo-market tier expectations", () => {
    const tiers = Object.fromEntries(
      demoMarkets.map((demoMarket) => [
        demoMarket.name,
        {
          score: scoreAndTierMarket(demoMarket).score,
          tier: scoreAndTierMarket(demoMarket).tier,
        },
      ]),
    );

    expect(tiers).toMatchInlineSnapshot(`
      {
        "Dallas-Fort Worth-Arlington": {
          "score": 72.7,
          "tier": 1,
        },
        "Detroit-Warren-Dearborn": {
          "score": 61.05,
          "tier": 2,
        },
        "Indianapolis-Carmel-Greenwood": {
          "score": 44.59,
          "tier": 3,
        },
        "New York-Newark-Jersey City": {
          "score": 80.25,
          "tier": 1,
        },
        "San Francisco-Oakland-Berkeley": {
          "score": 76.25,
          "tier": 1,
        },
        "San Jose-Sunnyvale-Santa Clara": {
          "score": 81.7,
          "tier": 1,
        },
      }
    `);
  });
});
