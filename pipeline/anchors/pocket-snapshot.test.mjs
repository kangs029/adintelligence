import { describe, expect, it } from "vitest";

import {
  anchorsFromPocketSamples,
  buildOverpassIdQuery,
  buildPocketMarketRollups,
  chunkRefs,
  collectPocketSamples,
  parseOsmRef,
} from "./pocket-snapshot.mjs";

const pockets = [
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
        groceries: [
          {
            name: "India Cash & Carry",
            link: "https://www.openstreetmap.org/way/12345",
          },
        ],
        cricket: [
          {
            name: "Cricket ground",
            link: "https://www.openstreetmap.org/relation/555",
          },
        ],
      },
    },
  },
  {
    geoid: "16000US2053775",
    community: { temples: 6, groceries: 1, cricket: 1, samples: {} },
  },
];

const markets = [
  {
    geoid: "31000US41940",
    population: { asianIndian: 202_245 },
  },
];

describe("v1 pocket anchor snapshot", () => {
  it("parses OSM object refs from sample links", () => {
    expect(parseOsmRef("https://www.openstreetmap.org/node/266651403")).toEqual({
      type: "node",
      id: "266651403",
      key: "node/266651403",
    });
    expect(parseOsmRef("https://example.com/not-osm")).toBeUndefined();
  });

  it("builds a compact Overpass id query for sample objects", () => {
    const query = buildOverpassIdQuery([
      { type: "node", id: "1" },
      { type: "way", id: "2" },
      { type: "node", id: "3" },
    ]);

    expect(query).toContain("node(id:1,3);");
    expect(query).toContain("way(id:2);");
    expect(query).toContain("out center tags;");
  });

  it("chunks refs so sample hydration does not create one oversized Overpass query", () => {
    expect(
      chunkRefs(
        [
          { type: "node", id: "1" },
          { type: "node", id: "2" },
          { type: "way", id: "3" },
        ],
        2,
      ),
    ).toEqual([
      [
        { type: "node", id: "1" },
        { type: "node", id: "2" },
      ],
      [{ type: "way", id: "3" }],
    ]);
  });

  it("collects sample refs and audited rollups for CBSA markets only", () => {
    expect(collectPocketSamples(pockets)).toEqual([
      {
        kind: "cricket",
        marketGeoid: "31000US41940",
        name: "Cricket ground",
        ref: { type: "relation", id: "555", key: "relation/555" },
      },
      {
        kind: "grocery",
        marketGeoid: "31000US41940",
        name: "India Cash & Carry",
        ref: { type: "way", id: "12345", key: "way/12345" },
      },
      {
        kind: "temple",
        marketGeoid: "31000US41940",
        name: "Sunnyvale Hindu Temple",
        ref: { type: "node", id: "266651403", key: "node/266651403" },
      },
    ]);

    expect(buildPocketMarketRollups({ pockets, markets })).toEqual({
      "31000US41940": {
        temples: 15,
        groceries: 41,
        cricket: 9,
        theaters: 0,
        per10kAI: 3.2139,
      },
    });
  });

  it("hydrates sample anchors from fetched OSM elements", () => {
    const anchors = anchorsFromPocketSamples({
      samples: collectPocketSamples(pockets),
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
          id: 12345,
          center: { lat: 37.4, lon: -122 },
          tags: { shop: "supermarket", name: "India Cash & Carry" },
        },
      ],
    });

    expect(anchors).toEqual([
      {
        id: "31000US41940:node/266651403",
        kind: "temple",
        name: "Sunnyvale Hindu Temple",
        lat: 37.4051796,
        lng: -122.0145573,
        marketGeoid: "31000US41940",
        osmUrl: "https://www.openstreetmap.org/node/266651403",
        tags: {
          amenity: "place_of_worship",
          religion: "hindu",
          name: "Sunnyvale Hindu Temple",
        },
        qaFlags: [],
      },
      {
        id: "31000US41940:way/12345",
        kind: "grocery",
        name: "India Cash & Carry",
        lat: 37.4,
        lng: -122,
        marketGeoid: "31000US41940",
        osmUrl: "https://www.openstreetmap.org/way/12345",
        tags: { shop: "supermarket", name: "India Cash & Carry" },
        qaFlags: ["name-match"],
      },
    ]);
  });
});
