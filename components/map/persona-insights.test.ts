import { describe, expect, it } from "vitest";

import { validateClaims } from "@/lib/claims/contract";
import { buildPersonaInsightLines } from "./persona-insights";

const markets = [
  {
    geoid: "31000US42660",
    name: "Seattle-Tacoma-Bellevue",
    tier: 1,
    population: { asianIndian: 100_000 },
    anchorSummary: { temples: 4, groceries: 12, cricket: 8, theaters: 0, per10kAI: 2.4 },
  },
  {
    geoid: "31000US19100",
    name: "Dallas-Fort Worth-Arlington",
    tier: 1,
    population: { asianIndian: 100_000 },
    anchorSummary: { temples: 4, groceries: 8, cricket: 2, theaters: 0, per10kAI: 1.4 },
  },
  {
    geoid: "31000US41940",
    name: "San Jose-Sunnyvale-Santa Clara",
    tier: 2,
    population: { asianIndian: 100_000 },
    anchorSummary: { temples: 6, groceries: 8, cricket: 2, theaters: 0, per10kAI: 1.6 },
  },
  {
    geoid: "31000US99999",
    name: "Audit Market",
    tier: 3,
    population: { asianIndian: 100_000 },
    anchorSummary: { temples: 50, groceries: 50, cricket: 50, theaters: 0, per10kAI: 15 },
  },
];

describe("buildPersonaInsightLines", () => {
  it("selects the strongest Tier 1 and Tier 2 density deltas", () => {
    const lines = buildPersonaInsightLines({
      market: markets[0],
      benchmarkMarkets: markets,
      cinema: {
        theaterSignalCount: 2,
        languageCounts: { Telugu: 4, Tamil: 1 },
      },
    });

    expect(lines).toHaveLength(3);
    expect(lines[0]?.text).toBe(
      "Cricket density 4.0x the Tier 1/2 median. Evidence for the young professional persona.",
    );
    expect(lines[1]?.text).toBe(
      "Telugu-first cinema footprint. Evidence for the Telugu family persona.",
    );
    expect(lines[2]?.text).toBe(
      "Grocery density 1.5x the Tier 1/2 median. Evidence for the family remitter persona.",
    );
    expect(lines.map((line) => line.href)).toEqual([
      "/playbook?market=31000US42660#personas",
      "/playbook?market=31000US42660#personas",
      "/playbook?market=31000US42660#personas",
    ]);
    expect(validateClaims(lines, "dossier")).toEqual([]);
  });

  it("returns at most three lines and stays quiet without real deltas", () => {
    expect(
      buildPersonaInsightLines({
        market: markets[1],
        benchmarkMarkets: markets,
        cinema: { theaterSignalCount: 0, languageCounts: {} },
      }),
    ).toEqual([]);
  });
});
