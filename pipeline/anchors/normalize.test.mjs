import { describe, expect, it } from "vitest";

import { normalizeOverpassElements } from "./normalize.mjs";

describe("normalizeOverpassElements", () => {
  it("normalizes Overpass nodes into anchors with OSM URLs and QA flags", () => {
    const anchors = normalizeOverpassElements({
      marketGeoid: "31000US41940",
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
          id: 123,
          center: { lat: 37.4, lon: -122 },
          tags: {
            shop: "supermarket",
            name: "Patel Brothers",
          },
        },
        {
          type: "node",
          id: 456,
          lat: 37.6,
          lon: -121.9,
          tags: {
            leisure: "pitch",
            sport: "cricket",
            name: "Bay Area Cricket Pitch",
          },
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
        id: "31000US41940:node/456",
        kind: "cricket",
        name: "Bay Area Cricket Pitch",
        lat: 37.6,
        lng: -121.9,
        marketGeoid: "31000US41940",
        osmUrl: "https://www.openstreetmap.org/node/456",
        tags: {
          leisure: "pitch",
          sport: "cricket",
          name: "Bay Area Cricket Pitch",
        },
        qaFlags: [],
      },
      {
        id: "31000US41940:way/123",
        kind: "grocery",
        name: "Patel Brothers",
        lat: 37.4,
        lng: -122,
        marketGeoid: "31000US41940",
        osmUrl: "https://www.openstreetmap.org/way/123",
        tags: {
          shop: "supermarket",
          name: "Patel Brothers",
        },
        qaFlags: ["name-match"],
      },
    ]);
  });

  it("drops elements excluded by QA rules or missing usable coordinates", () => {
    const anchors = normalizeOverpassElements({
      marketGeoid: "31000US41940",
      elements: [
        {
          type: "node",
          id: 1,
          lat: 44.6335,
          lon: -121.1295,
          tags: { shop: "supermarket", name: "Madras Market", "addr:city": "Madras", "addr:state": "OR" },
        },
        {
          type: "way",
          id: 2,
          tags: { amenity: "place_of_worship", religion: "hindu", name: "No Center Temple" },
        },
      ],
    });

    expect(anchors).toEqual([]);
  });
});
