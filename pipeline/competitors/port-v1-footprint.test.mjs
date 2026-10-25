import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildXpatFootprintArtifact } from "./port-v1-footprint.mjs";

const raw = JSON.parse(readFileSync("data/raw/v1-port/competitor-observations.json", "utf8"));

describe("v1 Xpat footprint port", () => {
  it("ports the two requested owned-footprint observations with original dates", () => {
    const artifact = buildXpatFootprintArtifact({ raw });

    expect(artifact.data.observations.map((observation) => observation.id)).toEqual(["obs_007", "obs_008"]);
    expect(artifact.data.observations.every((observation) => observation.capturedAt === "2026-06-17T00:00:00.000Z")).toBe(true);
    expect(artifact.data.summary).toContain("visible public ad-library presence");
    expect(artifact.data.observations[0].sourceUrl).toContain("adstransparency.google.com");
  });
});
