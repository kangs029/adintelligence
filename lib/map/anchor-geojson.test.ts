import { describe, expect, it } from "vitest";

import {
  assertSweptRollupsMatchAnchorFeatures,
  buildAnchorFeatureCollection,
} from "./anchor-geojson";

const anchorsArtifact = {
  data: {
    sweptMarkets: ["31000US42660"],
    marketRollups: {
      "31000US42660": {
        temples: 1,
        groceries: 1,
        cricket: 1,
        theaters: 0,
        per10kAI: 0.3,
      },
      "31000US19100": {
        temples: 5,
        groceries: 10,
        cricket: 3,
        theaters: 0,
        per10kAI: 2.1,
      },
    },
    anchors: [
      {
        id: "31000US42660:node/1",
        kind: "temple",
        lat: 47.1,
        lng: -122.1,
        marketGeoid: "31000US42660",
        name: "Seattle Temple",
        osmUrl: "https://www.openstreetmap.org/node/1",
      },
      {
        id: "31000US42660:node/2",
        kind: "grocery",
        lat: 47.2,
        lng: -122.2,
        marketGeoid: "31000US42660",
        name: "Seattle Grocery",
        osmUrl: "https://www.openstreetmap.org/node/2",
      },
      {
        id: "31000US42660:node/3",
        kind: "cricket",
        lat: 47.3,
        lng: -122.3,
        marketGeoid: "31000US42660",
        name: "Seattle Cricket",
        osmUrl: "https://www.openstreetmap.org/node/3",
      },
      {
        id: "31000US19100:node/4",
        kind: "temple",
        lat: 32.9,
        lng: -96.8,
        marketGeoid: "31000US19100",
        name: "Dallas Temple Sample",
        osmUrl: "https://www.openstreetmap.org/node/4",
      },
    ],
  },
};

describe("anchor GeoJSON", () => {
  it("projects anchor artifacts into map features with OSM URLs", () => {
    expect(buildAnchorFeatureCollection(anchorsArtifact).features[0]).toEqual({
      type: "Feature",
      id: "31000US42660:node/1",
      geometry: {
        type: "Point",
        coordinates: [-122.1, 47.1],
      },
      properties: {
        id: "31000US42660:node/1",
        kind: "temple",
        marketGeoid: "31000US42660",
        name: "Seattle Temple",
        osmUrl: "https://www.openstreetmap.org/node/1",
      },
    });
  });

  it("asserts swept market rollups match plottable anchor features", () => {
    expect(() => assertSweptRollupsMatchAnchorFeatures(anchorsArtifact)).not.toThrow();
  });

  it("fails when a swept market count does not match its plottable features", () => {
    const brokenArtifact = structuredClone(anchorsArtifact);
    brokenArtifact.data.marketRollups["31000US42660"].groceries = 2;

    expect(() => assertSweptRollupsMatchAnchorFeatures(brokenArtifact)).toThrow(
      "31000US42660 rollup count 4 does not match 3 anchor features",
    );
  });
});
