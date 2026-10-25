import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getMarketsArtifact } from "./markets";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "xpat-markets-"));
  mkdirSync(join(root, "data", "artifacts"), { recursive: true });
  return root;
}

describe("getMarketsArtifact", () => {
  it("loads the typed Census markets artifact", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, "data", "artifacts", "markets.json"),
      JSON.stringify({
        meta: {
          family: "markets",
          version: 1,
          generatedAt: "2026-07-02T19:00:00.000Z",
          provenance: "grounded",
          source: "US Census ACS 2024 5-year Detailed Tables",
          method: "ACS CBSA table joined to Census TIGERweb internal points",
          refreshCadence: "per ACS 5-year release",
          caveats: ["ACS estimates include margins of error."],
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
              population: { asianIndian: 202_245, moe: 5_199, total: 3_115_386 },
              concentration: {
                localSharePct: 6.492,
                usSharePct: 4.0625,
                multipleOfUS: 4.4355,
              },
              income: { medianHousehold: 167_674, moe: 2_412 },
              moeReliability: "high",
            },
          ],
        },
      }),
    );

    expect(getMarketsArtifact({ root }).data.markets[0]?.geoid).toBe("31000US41940");
  });
});
