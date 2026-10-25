import { describe, expect, it } from "vitest";

import {
  mergeAnchorRollupsIntoMarkets,
  rollupAnchorsByMarket,
} from "./rollups.mjs";

const marketsArtifact = {
  meta: {
    family: "markets",
    version: 1,
    generatedAt: "2026-07-02T00:00:00.000Z",
    provenance: "grounded",
    source: "fixture",
    method: "fixture",
    refreshCadence: "manual",
    caveats: [],
  },
  data: {
    release: "ACS 2024 5-year",
    variables: {
      asianIndian: "B02015_021E",
      asianIndianMoe: "B02015_021M",
      totalPopulation: "B01003_001E",
      totalPopulationMoe: "B01003_001M",
      medianHouseholdIncome: "B19013_001E",
      medianHouseholdIncomeMoe: "B19013_001M",
    },
    summary: {
      inputRows: 1,
      includedRows: 1,
      heldOutRows: 0,
      nationalAsianIndian: 4_978_388,
      nationalPopulation: 340_110_988,
    },
    markets: [
      {
        geoid: "31000US41940",
        name: "San Jose-Sunnyvale-Santa Clara",
        state: "CA",
        states: ["CA"],
        lat: 37.2207774,
        lng: -121.6906224,
        population: { asianIndian: 200_000, moe: 5_000, total: 3_000_000 },
        concentration: { localSharePct: 6.6, usSharePct: 4, multipleOfUS: 4.4 },
        moeReliability: "high",
      },
    ],
  },
};

describe("anchor rollups", () => {
  it("counts anchors by market and computes per-10k AI density", () => {
    expect(
      rollupAnchorsByMarket({
        anchors: [
          { kind: "temple", marketGeoid: "31000US41940" },
          { kind: "grocery", marketGeoid: "31000US41940" },
          { kind: "grocery", marketGeoid: "31000US41940" },
          { kind: "cricket", marketGeoid: "31000US41940" },
          { kind: "theater", marketGeoid: "31000US41940" },
        ],
        markets: marketsArtifact.data.markets,
      }),
    ).toEqual({
      "31000US41940": {
        temples: 1,
        groceries: 2,
        cricket: 1,
        theaters: 1,
        per10kAI: 0.25,
      },
    });
  });

  it("merges rollups into the markets artifact without changing source evidence", () => {
    const merged = mergeAnchorRollupsIntoMarkets({
      marketsArtifact,
      anchors: [
        { kind: "temple", marketGeoid: "31000US41940" },
        { kind: "grocery", marketGeoid: "31000US41940" },
      ],
    });

    expect(merged.data.markets[0]?.anchorSummary).toEqual({
      temples: 1,
      groceries: 1,
      cricket: 0,
      theaters: 0,
      per10kAI: 0.1,
    });
    expect(merged.meta.provenance).toBe("derived");
    expect(merged.meta.method).toContain("anchor rollups");
  });

  it("uses explicit audited market rollups when the anchor artifact carries counts separately from samples", () => {
    const merged = mergeAnchorRollupsIntoMarkets({
      marketsArtifact,
      anchors: [],
      marketRollups: {
        "31000US41940": {
          temples: 15,
          groceries: 41,
          cricket: 9,
          theaters: 0,
          per10kAI: 3.25,
        },
      },
    });

    expect(merged.data.markets[0]?.anchorSummary).toEqual({
      temples: 15,
      groceries: 41,
      cricket: 9,
      theaters: 0,
      per10kAI: 3.25,
    });
    expect(merged.data.markets[0]?.score).toEqual(expect.any(Number));
  });
});
