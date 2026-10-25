import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getAnchorsArtifact } from "./anchors";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "xpat-anchors-"));
  mkdirSync(join(root, "data", "artifacts"), { recursive: true });
  return root;
}

describe("getAnchorsArtifact", () => {
  it("loads typed anchor artifacts", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, "data", "artifacts", "anchors.json"),
      JSON.stringify({
        meta: {
          family: "anchors",
          version: 1,
          generatedAt: "2026-07-02T19:00:00.000Z",
          provenance: "snapshot",
          source: "OpenStreetMap Overpass API",
          method: "fixture",
          refreshCadence: "monthly",
          caveats: ["OSM coverage varies by market."],
        },
        data: {
          capturedAt: "2026-07-02T23:39:11Z",
          marketRollups: {
            "31000US41940": {
              temples: 1,
              groceries: 0,
              cricket: 0,
              theaters: 0,
              per10kAI: 0.0494,
            },
          },
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
        },
      }),
    );

    expect(getAnchorsArtifact({ root }).data.anchors[0]?.kind).toBe("temple");
  });
});
