import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMarketFeatureCollection,
  runMarketsGeoJson,
} from "./markets-geojson.mjs";

const fixtureMarketsArtifact = {
  meta: {
    family: "markets",
    version: 1,
    generatedAt: "2026-07-03T00:00:00.000Z",
    provenance: "derived",
    source: "fixture",
    method: "fixture",
    refreshCadence: "manual",
    caveats: [],
  },
  data: {
    release: "ACS 2024 5-year",
    markets: [
      {
        geoid: "31000US41940",
        name: "San Jose-Sunnyvale-Santa Clara",
        state: "CA",
        states: ["CA"],
        lat: 36.9084718,
        lng: -121.3713721,
        population: { asianIndian: 202_245, moe: 5_199, total: 1_969_337 },
        concentration: { localSharePct: 10.2697, usSharePct: 4.3724, multipleOfUS: 7.4362 },
        moeReliability: "high",
        score: 94.03,
        tier: 1,
        anchorSummary: { temples: 15, groceries: 41, cricket: 9, theaters: 0, per10kAI: 3.2139 },
        employmentProxy: { lcaFilings: 23_875, topEmployers: ["Adobe Inc.", "Google LLC"] },
        students: { activeIndianStudents: 6_947 },
      },
    ],
  },
};

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "xpat-markets-geojson-"));
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await writeFile(
    join(root, "data", "artifacts", "markets.json"),
    `${JSON.stringify(fixtureMarketsArtifact, null, 2)}\n`,
  );
  return root;
}

describe("markets GeoJSON", () => {
  it("builds compact point features for MapLibre", () => {
    const collection = buildMarketFeatureCollection(fixtureMarketsArtifact);

    expect(collection).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "31000US41940",
          geometry: {
            type: "Point",
            coordinates: [-121.3713721, 36.9084718],
          },
          properties: {
            geoid: "31000US41940",
            name: "San Jose-Sunnyvale-Santa Clara",
            state: "CA",
            states: ["CA"],
            tier: 1,
            score: 94.03,
            markerRadius: 14.05,
            asianIndian: 202_245,
            asianIndianMoe: 5_199,
            localSharePct: 10.2697,
            multipleOfUS: 7.4362,
            moeReliability: "high",
            anchorCount: 65,
            templeCount: 15,
            groceryCount: 41,
            cricketCount: 9,
            theaterCount: 0,
            anchorsPer10kAI: 3.2139,
            lcaFilings: 23_875,
            activeIndianStudents: 6_947,
          },
        },
      ],
    });
  });

  it("writes a deterministic artifact under the 1.5MB budget", async () => {
    const root = await makeRoot();

    await runMarketsGeoJson({ root });

    const output = await readFile(
      join(root, "data", "artifacts", "markets-geojson.json"),
      "utf8",
    );
    expect(Buffer.byteLength(output)).toBeLessThan(1_500_000);
    expect(JSON.parse(output).features).toHaveLength(1);
  });
});
