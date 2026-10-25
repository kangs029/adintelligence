import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { loadArtifact } from "./loader";

const audienceSchema = z.object({
  markets: z.array(
    z.object({
      slug: z.string(),
      score: z.number(),
    }),
  ),
});

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "xpat-artifacts-"));
  mkdirSync(join(root, "data", "artifacts"), { recursive: true });
  return root;
}

function writeArtifact(root: string, family: string, artifact: unknown) {
  writeFileSync(
    join(root, "data", "artifacts", `${family}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

describe("loadArtifact", () => {
  it("loads and validates an artifact with canonical meta", () => {
    const root = makeRoot();
    writeArtifact(root, "markets", {
      meta: {
        family: "markets",
        version: 1,
        generatedAt: "2026-07-02T19:00:00.000Z",
        provenance: "snapshot",
        source: "fixtures",
        method: "unit test fixture",
        refreshCadence: "manual",
        caveats: ["fixture only"],
      },
      data: {
        markets: [{ slug: "houston", score: 12 }],
      },
    });

    expect(loadArtifact("markets", audienceSchema, { root })).toEqual({
      meta: {
        family: "markets",
        version: 1,
        generatedAt: "2026-07-02T19:00:00.000Z",
        provenance: "snapshot",
        source: "fixtures",
        method: "unit test fixture",
        refreshCadence: "manual",
        caveats: ["fixture only"],
      },
      data: {
        markets: [{ slug: "houston", score: 12 }],
      },
    });
  });

  it("rejects artifact names that could escape data/artifacts", () => {
    const root = makeRoot();

    expect(() => loadArtifact("../markets", audienceSchema, { root })).toThrow(
      /artifact family/i,
    );
  });

  it("throws a descriptive error when the artifact file is missing", () => {
    const root = makeRoot();

    expect(() => loadArtifact("markets", audienceSchema, { root })).toThrow(
      /data\/artifacts\/markets\.json/,
    );
  });

  it("throws a descriptive error when meta or data drift from schema", () => {
    const root = makeRoot();
    writeArtifact(root, "markets", {
      meta: {
        family: "markets",
        version: 0,
        generatedAt: "not-a-date",
        provenance: "estimated",
        source: "",
        method: "unit test fixture",
        refreshCadence: "manual",
        caveats: "none",
      },
      data: {
        markets: [{ slug: "houston", score: "high" }],
      },
    });

    expect(() => loadArtifact("markets", audienceSchema, { root })).toThrow(
      /Artifact markets failed schema validation/,
    );
    expect(() => loadArtifact("markets", audienceSchema, { root })).toThrow(
      /meta\.provenance/,
    );
    expect(() => loadArtifact("markets", audienceSchema, { root })).toThrow(
      /data\.markets\.0\.score/,
    );
  });
});
