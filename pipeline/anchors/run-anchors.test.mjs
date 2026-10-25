import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { runAnchors } from "./run-anchors.mjs";

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
  const root = await mkdtemp(join(tmpdir(), "xpat-run-anchors-"));
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await writeFile(
    join(root, "data", "artifacts", "markets.json"),
    `${JSON.stringify(marketsArtifact, null, 2)}\n`,
  );
  return root;
}

async function writeExistingAnchors(root) {
  await writeFile(
    join(root, "data", "artifacts", "anchors.json"),
    `${JSON.stringify(
      {
        meta: {
          family: "anchors",
          version: 1,
          generatedAt: "2026-07-03T00:00:00.000Z",
          provenance: "snapshot",
          source: "OpenStreetMap Overpass API via v1 audited pocket snapshot",
          method: "fixture",
          refreshCadence: "monthly",
          caveats: ["Sample anchors are evidence examples."],
        },
        data: {
          capturedAt: "2026-06-13T00:00:00.000Z",
          marketRollups: {
            "31000US19100": {
              temples: 5,
              groceries: 10,
              cricket: 3,
              theaters: 0,
              per10kAI: 2.1,
            },
            "31000US41940": {
              temples: 15,
              groceries: 41,
              cricket: 9,
              theaters: 0,
              per10kAI: 3.2,
            },
          },
          anchors: [
            {
              id: "31000US19100:node/1",
              kind: "temple",
              name: "Dallas Temple",
              lat: 32.9,
              lng: -96.8,
              marketGeoid: "31000US19100",
              osmUrl: "https://www.openstreetmap.org/node/1",
              tags: { amenity: "place_of_worship", religion: "hindu" },
              qaFlags: [],
            },
            {
              id: "31000US41940:node/2",
              kind: "temple",
              name: "Old San Jose Sample",
              lat: 37.4,
              lng: -122.0,
              marketGeoid: "31000US41940",
              osmUrl: "https://www.openstreetmap.org/node/2",
              tags: { amenity: "place_of_worship", religion: "hindu" },
              qaFlags: [],
            },
          ],
        },
      },
      null,
      2,
    )}\n`,
  );
}

async function readJson(root, family) {
  return JSON.parse(await readFile(join(root, "data", "artifacts", `${family}.json`), "utf8"));
}

describe("runAnchors", () => {
  it("writes anchors and merges rollups into markets from fetched elements", async () => {
    const root = await makeRoot();
    const fetchGeometries = vi.fn(async () => [
      {
        cbsa: "41940",
        bbox: { south: 36.7, west: -122.2, north: 37.5, east: -121.1 },
      },
    ]);
    const fetchElements = vi.fn(async () => ({
      capturedAt: "2026-07-03T02:00:00Z",
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

    await runAnchors({
      root,
      generatedAt: "2026-07-03T00:00:00.000Z",
      fetchGeometries,
      fetchElements,
      delayMs: 0,
    });

    const anchors = await readJson(root, "anchors");
    const markets = await readJson(root, "markets");

    expect(fetchElements).toHaveBeenCalledWith(
      expect.objectContaining({
        market: marketsArtifact.data.markets[0],
        bbox: { south: 36.7, west: -122.2, north: 37.5, east: -121.1 },
      }),
    );
    expect(anchors.data).toMatchObject({
      capturedAt: "2026-07-03T02:00:00Z",
      anchors: [
        {
          id: "31000US41940:node/266651403",
          kind: "temple",
          marketGeoid: "31000US41940",
        },
      ],
    });
    expect(markets.meta.provenance).toBe("derived");
    expect(markets.data.markets[0]).toMatchObject({
      anchorSummary: {
        temples: 1,
        groceries: 0,
        cricket: 0,
        theaters: 0,
        per10kAI: 0.0494,
      },
      score: expect.any(Number),
      tier: expect.any(Number),
    });
  });

  it("sweeps only Tier 1 and Tier 2 markets, then preserves audited rollups for unswept markets", async () => {
    const root = await makeRoot();
    const fixture = structuredClone(marketsArtifact);
    fixture.data.markets = [
      {
        ...marketsArtifact.data.markets[0],
        tier: 1,
      },
      {
        ...marketsArtifact.data.markets[0],
        geoid: "31000US19100",
        name: "Dallas-Fort Worth-Arlington",
        state: "TX",
        states: ["TX"],
        population: { asianIndian: 100_000, moe: 4_000, total: 8_000_000 },
        tier: 3,
      },
    ];
    await writeFile(
      join(root, "data", "artifacts", "markets.json"),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
    await writeExistingAnchors(root);

    const fetchGeometries = vi.fn(async () => [
      {
        cbsa: "41940",
        bbox: { south: 36.7, west: -122.2, north: 37.5, east: -121.1 },
      },
    ]);
    const fetchElements = vi.fn(async () => ({
      capturedAt: "2026-07-06T02:00:00Z",
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
        {
          type: "way",
          id: 200,
          center: { lat: 37.4, lon: -122.01 },
          tags: {
            shop: "supermarket",
            name: "Patel Brothers",
          },
        },
      ],
    }));

    await runAnchors({
      root,
      generatedAt: "2026-07-06T00:00:00.000Z",
      fetchGeometries,
      fetchElements,
      delayMs: 0,
    });

    const anchors = await readJson(root, "anchors");
    const markets = await readJson(root, "markets");

    expect(fetchGeometries).toHaveBeenCalledWith({ cbsas: ["41940"] });
    expect(fetchElements).toHaveBeenCalledTimes(1);
    expect(anchors.data.sweptMarkets).toEqual(["31000US41940"]);
    expect(anchors.data.anchors.map((anchor) => anchor.marketGeoid).sort()).toEqual([
      "31000US19100",
      "31000US41940",
      "31000US41940",
    ]);
    expect(anchors.data.marketRollups["31000US41940"]).toMatchObject({
      temples: 1,
      groceries: 1,
      cricket: 0,
      theaters: 0,
    });
    expect(anchors.data.marketRollups["31000US19100"]).toEqual({
      temples: 5,
      groceries: 10,
      cricket: 3,
      theaters: 0,
      per10kAI: 2.1,
    });
    expect(markets.data.markets.find((market) => market.geoid === "31000US41940")?.anchorSummary).toEqual(
      anchors.data.marketRollups["31000US41940"],
    );
    expect(anchors.meta.caveats).toContain(
      "Tier 1 and Tier 2 markets were refreshed from live Overpass sweeps; other market rollups retain audited v1 pocket counts.",
    );
    expect(anchors.meta.caveats).toContain(
      "Live Overpass sweep for San Jose-Sunnyvale-Santa Clara returned 2 anchors versus 65 audited v1 anchors; fetched truth wins.",
    );
  });
});
