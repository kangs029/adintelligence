import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { runAnchorSnapshot } from "./run-anchor-snapshot.mjs";

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
      inputRows: 1,
      includedRows: 1,
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
        population: { asianIndian: 202_245, moe: 5_199, total: 1_969_337 },
        concentration: { localSharePct: 10.2697, usSharePct: 4.3724, multipleOfUS: 7.4362 },
        moeReliability: "high",
        score: 54.4,
        tier: 2,
      },
    ],
  },
};

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "xpat-run-anchor-snapshot-"));
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await mkdir(join(root, "data", "raw", "anchors"), { recursive: true });
  await writeFile(
    join(root, "data", "artifacts", "markets.json"),
    `${JSON.stringify(marketsArtifact, null, 2)}\n`,
  );
  await writeFile(
    join(root, "data", "raw", "anchors", "pockets.json"),
    JSON.stringify({
      osm: { asOf: "2026-06-13" },
      pockets: [
        {
          geoid: "31000US41940",
          community: {
            temples: 15,
            groceries: 41,
            cricket: 9,
            samples: {
              temples: [
                {
                  name: "Sunnyvale Hindu Temple",
                  link: "https://www.openstreetmap.org/node/266651403",
                },
              ],
            },
          },
        },
      ],
    }),
  );
  return root;
}

async function readJson(root, family) {
  return JSON.parse(await readFile(join(root, "data", "artifacts", `${family}.json`), "utf8"));
}

describe("runAnchorSnapshot", () => {
  it("writes sample anchors and audited rollups from v1 pocket evidence", async () => {
    const root = await makeRoot();
    const fetchElements = vi.fn(async () => ({
      capturedAt: "2026-07-03T06:44:29Z",
      elements: [
        {
          type: "node",
          id: 266651403,
          lat: 37.4051796,
          lon: -122.0145573,
          tags: {
            amenity: "place_of_worship",
            religion: "hindu",
            name: "Sunnyvale Hindu Temple",
          },
        },
      ],
    }));

    await runAnchorSnapshot({
      root,
      generatedAt: "2026-07-03T00:00:00.000Z",
      fetchElements,
    });

    const anchors = await readJson(root, "anchors");
    const markets = await readJson(root, "markets");

    expect(fetchElements).toHaveBeenCalledWith(expect.stringContaining("node(id:266651403);"));
    expect(anchors).toMatchObject({
      meta: {
        family: "anchors",
        provenance: "snapshot",
      },
      data: {
        capturedAt: "2026-06-13T00:00:00.000Z",
        marketRollups: {
          "31000US41940": {
            temples: 15,
            groceries: 41,
            cricket: 9,
            theaters: 0,
            per10kAI: 3.2139,
          },
        },
      },
    });
    expect(anchors.data.anchors[0]).toMatchObject({
      id: "31000US41940:node/266651403",
      kind: "temple",
    });
    expect(markets.data.markets[0]).toMatchObject({
      anchorSummary: anchors.data.marketRollups["31000US41940"],
      score: expect.any(Number),
      tier: expect.any(Number),
    });
  });
});
