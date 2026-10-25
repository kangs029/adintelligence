import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { artifactMetadata, formatArtifactDate, latestGeneratedAt } from "./artifact-metadata";

const artifactsDir = join(process.cwd(), "data/artifacts");

describe("artifact metadata", () => {
  it("lists every committed artifact file in the freshness model", () => {
    const jsonFiles = readdirSync(artifactsDir)
      .filter((file) => file.endsWith(".json"))
      .sort();
    const rows = artifactMetadata();

    expect(rows.map((row) => row.file).sort()).toEqual(jsonFiles);
    expect(new Set(rows.map((row) => row.family)).size).toBe(rows.length);
  });

  it("keeps source, method, cadence, and caveats for each row", () => {
    expect(
      artifactMetadata().every(
        (row) =>
          row.generatedAt &&
          row.provenance &&
          row.source &&
          row.method &&
          row.refreshCadence &&
          row.caveats.length > 0,
      ),
    ).toBe(true);
  });

  it("uses artifact meta directly when available", () => {
    const markets = JSON.parse(readFileSync(join(artifactsDir, "markets.json"), "utf8"));
    const row = artifactMetadata().find((candidate) => candidate.family === "markets");

    expect(row).toMatchObject({
      file: "markets.json",
      generatedAt: markets.meta.generatedAt,
      method: markets.meta.method,
      source: markets.meta.source,
    });
  });

  it("derives the map projection row from markets metadata", () => {
    const markets = JSON.parse(readFileSync(join(artifactsDir, "markets.json"), "utf8"));
    const row = artifactMetadata().find((candidate) => candidate.family === "markets-geojson");

    expect(row).toMatchObject({
      file: "markets-geojson.json",
      generatedAt: markets.meta.generatedAt,
      provenance: "derived",
      source: "data/artifacts/markets.json",
    });
  });

  it("formats the latest freshness date for display", () => {
    expect(formatArtifactDate(latestGeneratedAt())).toMatch(/\w{3} \d{1,2}, 2026/u);
  });
});
