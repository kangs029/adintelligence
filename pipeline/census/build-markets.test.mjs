import { describe, expect, it } from "vitest";

import { ACS_VARIABLES } from "./constants.mjs";
import { buildCensusArtifacts } from "./build-markets.mjs";

describe("buildCensusArtifacts", () => {
  it("stamps markets and audit artifacts with Census provenance", () => {
    const artifacts = buildCensusArtifacts({
      generatedAt: "2026-07-02T00:00:00.000Z",
      normalized: {
        markets: [
          {
            geoid: "31000US41940",
            name: "San Jose-Sunnyvale-Santa Clara",
            state: "CA",
            states: ["CA"],
            lat: 37.2207774,
            lng: -121.6906224,
            population: { asianIndian: 202_245, moe: 5_199, total: 3_115_386 },
            concentration: {
              localSharePct: 6.4918,
              usSharePct: 4.0625,
              multipleOfUS: 4.435,
            },
            income: { medianHousehold: 167_674, moe: 2_412 },
            moeReliability: "high",
          },
        ],
        audit: {
          summary: {
            inputRows: 2,
            includedRows: 1,
            heldOutRows: 1,
            nationalAsianIndian: 4_978_388,
            nationalPopulation: 340_110_988,
          },
          heldOut: [
            {
              cbsa: "99999",
              geoid: "31000US99999",
              name: "Smallville, TX Micro Area",
              asianIndian: 499,
              moe: 30,
              moeReliability: "high",
              reason: "asian-indian-estimate-below-500",
            },
          ],
        },
      },
    });

    expect(artifacts.marketsArtifact).toMatchObject({
      meta: {
        family: "markets",
        version: 1,
        generatedAt: "2026-07-02T00:00:00.000Z",
        provenance: "grounded",
        source: "US Census ACS 2024 5-year Detailed Tables and Census TIGERweb ACS 2024 CBSA layers",
      },
      data: {
        release: "ACS 2024 5-year",
        variables: ACS_VARIABLES,
        summary: {
          inputRows: 2,
          includedRows: 1,
          heldOutRows: 1,
          nationalAsianIndian: 4_978_388,
          nationalPopulation: 340_110_988,
        },
      },
    });
    expect(artifacts.marketsArtifact.meta.method).toContain("included 1");
    expect(artifacts.marketsArtifact.meta.method).toContain("held out 1");
    expect(artifacts.marketsArtifact.data.markets[0]).toMatchObject({
      score: expect.any(Number),
      tier: expect.any(Number),
    });
    expect(artifacts.auditArtifact.meta.family).toBe("markets-audit");
    expect(artifacts.auditArtifact.data.heldOut[0]?.reason).toBe(
      "asian-indian-estimate-below-500",
    );
  });
});
