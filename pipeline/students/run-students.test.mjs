import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runStudents } from "./run-students.mjs";

const marketsArtifact = {
  meta: {
    family: "markets",
    version: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
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
      inputRows: 2,
      includedRows: 2,
      heldOutRows: 0,
      nationalAsianIndian: 4_625_449,
      nationalPopulation: 334_922_499,
    },
    markets: [
      {
        geoid: "31000US41940",
        name: "San Jose-Sunnyvale-Santa Clara",
        state: "CA",
        states: ["CA"],
        lat: 36.9084718,
        lng: -121.3713721,
        population: { asianIndian: 200_000, moe: 5_000, total: 2_000_000 },
        concentration: { localSharePct: 10, usSharePct: 4, multipleOfUS: 7 },
        moeReliability: "high",
        score: 54,
        tier: 2,
      },
      {
        geoid: "31000US41860",
        name: "San Francisco-Oakland-Fremont",
        state: "CA",
        states: ["CA"],
        lat: 37.773731,
        lng: -122.274778,
        population: { asianIndian: 100_000, moe: 5_000, total: 4_000_000 },
        concentration: { localSharePct: 2.5, usSharePct: 2, multipleOfUS: 2 },
        moeReliability: "high",
        score: 40,
        tier: 3,
      },
    ],
  },
};

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "xpat-run-students-"));
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await mkdir(join(root, "data", "raw"), { recursive: true });
  await writeFile(
    join(root, "data", "artifacts", "markets.json"),
    `${JSON.stringify(marketsArtifact, null, 2)}\n`,
  );
  await writeFile(
    join(root, "data", "raw", "sevis_august_2025.html"),
    `
      <table>
        <tr><th>Country of Citizenship</th><th>Active Students</th><th>CA</th></tr>
        <tr><td>INDIA</td><td>300,000</td><td>30,000</td></tr>
      </table>
    `,
  );
  return root;
}

async function readJson(root, family) {
  return JSON.parse(await readFile(join(root, "data", "artifacts", `${family}.json`), "utf8"));
}

describe("runStudents", () => {
  it("writes students and merges state-allocated counts into markets", async () => {
    const root = await makeRoot();

    await runStudents({
      root,
      generatedAt: "2026-07-03T00:00:00.000Z",
    });

    const students = await readJson(root, "students");
    const markets = await readJson(root, "markets");

    expect(students.meta.provenance).toBe("grounded");
    expect(students.data.allocations).toEqual({
      "31000US41860": {
        activeIndianStudents: 10_000,
        allocationMethod: "state-ai-pop-share",
      },
      "31000US41940": {
        activeIndianStudents: 20_000,
        allocationMethod: "state-ai-pop-share",
      },
    });
    expect(markets.meta.provenance).toBe("derived");
    expect(markets.data.markets[0]).toMatchObject({
      students: { activeIndianStudents: expect.any(Number) },
      score: expect.any(Number),
      tier: expect.any(Number),
    });
  });
});
