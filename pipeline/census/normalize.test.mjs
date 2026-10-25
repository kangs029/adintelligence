import { describe, expect, it } from "vitest";

import {
  normalizeMarkets,
  parseMarketName,
  qualityReasonForRow,
  reliabilityBucket,
} from "./normalize.mjs";

const HEADERS = [
  "NAME",
  "B02015_021E",
  "B02015_021M",
  "B01003_001E",
  "B01003_001M",
  "B19013_001E",
  "B19013_001M",
  "metropolitan statistical area/micropolitan statistical area",
];

const NATIONAL_HEADERS = [
  "NAME",
  "B02015_021E",
  "B02015_021M",
  "B01003_001E",
  "B01003_001M",
  "B19013_001E",
  "B19013_001M",
  "us",
];

describe("Census market normalization", () => {
  it("parses Census CBSA names into display names and state arrays", () => {
    expect(parseMarketName("San Jose-Sunnyvale-Santa Clara, CA Metro Area")).toEqual({
      name: "San Jose-Sunnyvale-Santa Clara",
      state: "CA",
      states: ["CA"],
    });
    expect(parseMarketName("Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metro Area")).toEqual({
      name: "Philadelphia-Camden-Wilmington",
      state: "PA",
      states: ["PA", "NJ", "DE", "MD"],
    });
  });

  it("buckets MOE reliability from the estimate-to-MOE ratio", () => {
    expect(reliabilityBucket(202_245, 5_199)).toBe("high");
    expect(reliabilityBucket(2_200, 900)).toBe("medium");
    expect(reliabilityBucket(1_000, 1_500)).toBe("low");
    expect(reliabilityBucket(1_000, 0)).toBe("high");
  });

  it("normalizes rows, joins Census points, and computes concentration fields", () => {
    const result = normalizeMarkets({
      nationalRows: [
        NATIONAL_HEADERS,
        ["United States", "4,978,388", "25,794", "340,110,988", "0", "80,610", "273", "1"],
      ],
      cbsaRows: [
        HEADERS,
        [
          "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
          "202245",
          "5199",
          "3115386",
          "0",
          "167674",
          "2412",
          "41940",
        ],
        [
          "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metro Area",
          "125000",
          "6000",
          "6245051",
          "0",
          "-666666666",
          "-222222222",
          "37980",
        ],
      ],
      points: [
        {
          cbsa: "41940",
          name: "San Jose-Sunnyvale-Santa Clara, CA Metro Area",
          lat: 37.2207774,
          lng: -121.6906224,
        },
        {
          cbsa: "37980",
          name: "Philadelphia-Camden-Wilmington, PA-NJ-DE-MD Metro Area",
          lat: 39.9526,
          lng: -75.1652,
        },
      ],
    });

    const sanJose = result.markets.find((market) => market.geoid === "31000US41940");

    expect(sanJose).toMatchObject({
      geoid: "31000US41940",
      name: "San Jose-Sunnyvale-Santa Clara",
      state: "CA",
      states: ["CA"],
      lat: 37.2207774,
      lng: -121.6906224,
      population: { asianIndian: 202_245, moe: 5_199, total: 3_115_386 },
      income: { medianHousehold: 167_674, moe: 2_412 },
      moeReliability: "high",
    });
    expect(sanJose.population.asianIndian).toBeGreaterThan(202_245 * 0.85);
    expect(sanJose.population.asianIndian).toBeLessThan(202_245 * 1.15);
    expect(sanJose.concentration).toEqual({
      localSharePct: 6.4918,
      usSharePct: 4.0625,
      multipleOfUS: 4.435,
    });

    const philadelphia = result.markets.find((market) => market.geoid === "31000US37980");
    expect(philadelphia.income).toBeUndefined();
    expect(philadelphia.states).toEqual(["PA", "NJ", "DE", "MD"]);

    expect(result.audit.summary).toEqual({
      inputRows: 2,
      includedRows: 2,
      heldOutRows: 0,
      nationalAsianIndian: 4_978_388,
      nationalPopulation: 340_110_988,
    });
  });

  it("holds out low-quality rows with inspectable reasons", () => {
    expect(
      qualityReasonForRow({
        asianIndian: 499,
        moeReliability: "high",
        hasPoint: true,
      }),
    ).toBe("asian-indian-estimate-below-500");
    expect(
      qualityReasonForRow({
        asianIndian: 1_800,
        moeReliability: "low",
        hasPoint: true,
      }),
    ).toBe("low-reliability-under-2000");
    expect(
      qualityReasonForRow({
        asianIndian: 10_000,
        moeReliability: "high",
        hasPoint: false,
      }),
    ).toBe("missing-census-point");

    const result = normalizeMarkets({
      nationalRows: [
        NATIONAL_HEADERS,
        ["United States", "4,978,388", "25,794", "340,110,988", "0", "80,610", "273", "1"],
      ],
      cbsaRows: [
        HEADERS,
        ["Smallville, TX Micro Area", "499", "30", "20000", "0", "65000", "1000", "99999"],
        ["Noisyville, WA Metro Area", "1800", "2500", "90000", "0", "90000", "1000", "88888"],
        ["Pointless, CA Metro Area", "10000", "500", "100000", "0", "90000", "1000", "77777"],
      ],
      points: [],
    });

    expect(result.markets).toEqual([]);
    expect(result.audit.heldOut).toEqual([
      {
        cbsa: "77777",
        geoid: "31000US77777",
        name: "Pointless, CA Metro Area",
        asianIndian: 10_000,
        moe: 500,
        moeReliability: "high",
        reason: "missing-census-point",
      },
      {
        cbsa: "88888",
        geoid: "31000US88888",
        name: "Noisyville, WA Metro Area",
        asianIndian: 1_800,
        moe: 2_500,
        moeReliability: "low",
        reason: "low-reliability-under-2000",
      },
      {
        cbsa: "99999",
        geoid: "31000US99999",
        name: "Smallville, TX Micro Area",
        asianIndian: 499,
        moe: 30,
        moeReliability: "high",
        reason: "asian-indian-estimate-below-500",
      },
    ]);
    expect(result.audit.summary.heldOutRows).toBe(3);
  });
});
