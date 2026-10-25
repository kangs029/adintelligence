import { describe, expect, it } from "vitest";

import {
  allocateIndianStudentsToMarkets,
  buildStudentsArtifact,
  parseSevisIndiaStateTable,
} from "./normalize.mjs";

describe("SEVIS student normalization", () => {
  it("parses the India row from SEVIS Data Mapping Tool HTML", () => {
    const html = `
      <table>
        <tr><th>Country of Citizenship</th><th>Active Students</th><th>CA</th><th>TX</th></tr>
        <tr><td>INDIA</td><td>370,378</td><td>30,589</td><td>39,716</td></tr>
      </table>
    `;

    expect(parseSevisIndiaStateTable(html)).toEqual({
      country: "INDIA",
      activeStudents: 370_378,
      states: { CA: 30_589, TX: 39_716 },
    });
  });

  it("allocates state-level India student counts to markets by Asian Indian population share", () => {
    const allocations = allocateIndianStudentsToMarkets({
      stateStudents: { CA: 30_000, TX: 40_000 },
      markets: [
        {
          geoid: "31000US41940",
          state: "CA",
          population: { asianIndian: 200_000 },
        },
        {
          geoid: "31000US41860",
          state: "CA",
          population: { asianIndian: 100_000 },
        },
        {
          geoid: "31000US19100",
          state: "TX",
          population: { asianIndian: 200_000 },
        },
      ],
    });

    expect(allocations).toEqual({
      "31000US19100": {
        activeIndianStudents: 40_000,
        allocationMethod: "state-ai-pop-share",
      },
      "31000US41860": {
        activeIndianStudents: 10_000,
        allocationMethod: "state-ai-pop-share",
      },
      "31000US41940": {
        activeIndianStudents: 20_000,
        allocationMethod: "state-ai-pop-share",
      },
    });
  });

  it("stamps student allocations with state-allocation caveats", () => {
    const artifact = buildStudentsArtifact({
      generatedAt: "2026-07-02T00:00:00.000Z",
      sevis: {
        country: "INDIA",
        activeStudents: 370_378,
        states: { CA: 30_589 },
      },
      allocations: {
        "31000US41940": {
          activeIndianStudents: 30_589,
          allocationMethod: "state-ai-pop-share",
        },
      },
    });

    expect(artifact.meta).toMatchObject({
      family: "students",
      provenance: "grounded",
      source: "Study in the States SEVIS Data Mapping Tool August 2025",
    });
    expect(artifact.meta.caveats).toContain(
      "Market student counts are allocated from state-level India active-student totals by Asian Indian population share.",
    );
  });
});
