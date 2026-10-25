import { describe, expect, it } from "vitest";

import { buildAnchorsArtifact } from "./build-anchors.mjs";

describe("buildAnchorsArtifact", () => {
  it("stamps anchors with snapshot provenance", () => {
    const artifact = buildAnchorsArtifact({
      generatedAt: "2026-07-02T00:00:00.000Z",
      capturedAt: "2026-07-02T23:39:11Z",
      anchors: [
        {
          id: "node/266651403",
          kind: "temple",
          name: "Sunnyvale Hindu Temple",
          lat: 37.4051796,
          lng: -122.0145573,
          marketGeoid: "31000US41940",
          osmUrl: "https://www.openstreetmap.org/node/266651403",
          tags: { amenity: "place_of_worship", religion: "hindu" },
          qaFlags: [],
        },
      ],
    });

    expect(artifact).toMatchObject({
      meta: {
        family: "anchors",
        version: 1,
        generatedAt: "2026-07-02T00:00:00.000Z",
        provenance: "snapshot",
        source: "OpenStreetMap Overpass API",
      },
      data: {
        capturedAt: "2026-07-02T23:39:11Z",
      },
    });
    expect(artifact.meta.method).toContain("1 anchors");
  });
});
