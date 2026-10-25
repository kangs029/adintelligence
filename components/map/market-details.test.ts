import { describe, expect, it } from "vitest";

import { validateClaims } from "@/lib/claims/contract";
import { buildMarketDrawerModel } from "./market-details";

const market = {
  geoid: "31000US41940",
  name: "San Jose-Sunnyvale-Santa Clara",
  state: "CA",
  states: ["CA"],
  score: 94.03,
  tier: 1,
  population: { asianIndian: 202_245, moe: 5_199, total: 1_969_337 },
  concentration: { localSharePct: 10.2697, multipleOfUS: 7.4362, usSharePct: 4.3724 },
  moeReliability: "high",
  anchorSummary: { temples: 15, groceries: 41, cricket: 9, theaters: 0, per10kAI: 3.2139 },
  employmentProxy: { lcaFilings: 23_875, topEmployers: ["Adobe Inc.", "Google LLC"] },
  students: { activeIndianStudents: 6_947 },
};

const anchorsArtifact = {
  data: {
    anchors: [
      {
        id: "a1",
        kind: "temple",
        marketGeoid: "31000US41940",
        name: "Sunnyvale Hindu Temple",
        osmUrl: "https://www.openstreetmap.org/node/1",
        qaFlags: [],
      },
      {
        id: "a2",
        kind: "grocery",
        marketGeoid: "31000US41940",
        name: "India Cash & Carry",
        osmUrl: "https://www.openstreetmap.org/node/2",
        qaFlags: ["name-match"],
      },
      {
        id: "a3",
        kind: "temple",
        marketGeoid: "31000US19100",
        name: "Dallas Temple",
        osmUrl: "https://www.openstreetmap.org/node/3",
        qaFlags: [],
      },
      {
        id: "a4",
        kind: "cricket",
        marketGeoid: "31000US41940",
        name: "Cricket ground",
        osmUrl: "https://www.openstreetmap.org/way/4",
        qaFlags: ["generic-name"],
      },
      {
        id: "a5",
        kind: "cricket",
        marketGeoid: "31000US41940",
        name: "Cricket ground",
        osmUrl: "https://www.openstreetmap.org/way/5",
        qaFlags: ["generic-name"],
      },
      {
        id: "a6",
        kind: "grocery",
        marketGeoid: "31000US41940",
        name: "Bharat Bazar",
        osmUrl: "https://www.openstreetmap.org/node/6",
        qaFlags: [],
      },
    ],
  },
};

const cinemaArtifact = {
  data: {
    capturedAt: "2026-06-20",
    citySummaries: [
      {
        city: "San Jose",
        regionCode: "CA",
        theaterCount: 9,
        theaters: [
          { chain: "", theaterName: "Eastridge 15 with IMAX, Dolby" },
          { chain: "AMC Entertainment", theaterName: "AMC Eastridge 15" },
          { chain: "AMC", theaterName: "Eastridge 15" },
          { chain: "AMC", theaterName: "AMC Eastridge 15" },
          { chain: "Cinemark", theaterName: "Century 20 Oakridge" },
        ],
      },
      {
        city: "Dallas",
        regionCode: "TX",
        theaterCount: 4,
        theaters: [{ chain: "AMC", theaterName: "Dallas Theater" }],
      },
    ],
    theaterSignals: [
      {
        id: "signal-1",
        joinedMarketRef: { kind: "pocket", id: "31000US41940" },
        language: "Telugu",
        theaterName: "AMC Eastridge 15",
        chain: "AMC",
      },
      {
        id: "signal-2",
        joinedMarketRef: { kind: "pocket", id: "31000US41940" },
        language: "Tamil",
        theaterName: "Cinemark Century 20 Oakridge",
        chain: "Cinemark",
      },
      {
        id: "signal-3",
        joinedMarketRef: { kind: "pocket", id: "31000US41940" },
        language: "Telugu",
        theaterName: "AMC Eastridge 15 with IMAX",
        chain: "AMC Entertainment",
      },
      {
        id: "signal-4",
        joinedMarketRef: { kind: "pocket", id: "31000US19100" },
        language: "Hindi",
        theaterName: "Dallas Theater",
        chain: "AMC",
      },
    ],
  },
};

describe("buildMarketDrawerModel", () => {
  it("collects market sections from grounded and snapshot artifacts", () => {
    const model = buildMarketDrawerModel({
      market,
      anchorsArtifact,
      cinemaArtifact,
      benchmarkMarkets: [market],
    });

    expect(model.anchorRows).toHaveLength(4);
    expect(model.anchorRows.find((anchor) => anchor.name === "India Cash & Carry")).toMatchObject({
      name: "India Cash & Carry",
      qaFlags: ["name-match"],
    });
    expect(model.anchorTotal).toBe(65);
    expect(model.cinema).toEqual({
      capturedAt: "2026-06-20",
      exampleTheaters: ["AMC Eastridge 15", "Cinemark Century 20 Oakridge"],
      languageSummary: "Telugu, Tamil",
      theaterSignalCount: 2,
    });
    expect(model.personaInsights.length).toBeLessThanOrEqual(3);
    expect(validateClaims(model.personaInsights, "dossier")).toEqual([]);
  });

  it("prioritizes named distinct anchor samples and collapses repeated generic rows", () => {
    const model = buildMarketDrawerModel({
      market,
      anchorsArtifact,
      cinemaArtifact,
      benchmarkMarkets: [market],
    });

    expect(model.anchorRows.map((anchor) => anchor.name)).toEqual([
      "Sunnyvale Hindu Temple",
      "Bharat Bazar",
      "India Cash & Carry",
      "Cricket ground",
    ]);
    expect(model.anchorRows.at(-1)).toMatchObject({
      kind: "cricket",
      duplicateCount: 2,
      displayName: "Unnamed cricket ground ×2",
    });
  });

  it("includes cinema signals keyed by legacy market aliases", () => {
    const model = buildMarketDrawerModel({
      market: {
        ...market,
        geoid: "31000US26900",
        name: "Indianapolis-Carmel-Greenwood",
        state: "IN",
        states: ["IN"],
        anchorSummary: { temples: 0, groceries: 0, cricket: 0, theaters: 0, per10kAI: 0 },
      },
      anchorsArtifact,
      cinemaArtifact: {
        data: {
          capturedAt: "2026-06-20",
          theaterSignals: [
            {
              joinedMarketRef: { kind: "pocket", id: "indianapolis-greenwood-in" },
              language: "Telugu",
              theaterName: "Cinemark Greenwood Corner",
              chain: "Cinemark",
            },
          ],
        },
      },
      benchmarkMarkets: [market],
    });

    expect(model.cinema).toMatchObject({
      exampleTheaters: ["Cinemark Greenwood Corner"],
      languageSummary: "Telugu",
      theaterSignalCount: 1,
    });
  });
});
