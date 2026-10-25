import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildV1CreatorsArtifact, isEvidenceLinkedCreator } from "./port-v1-creators.mjs";

const raw = JSON.parse(readFileSync("data/raw/v1-port/competitors.json", "utf8"));

describe("v1 creator port", () => {
  it("ports all v1 creators with original capture dates and evidence text", () => {
    const artifact = buildV1CreatorsArtifact({ raw });

    expect(artifact.data.creators).toHaveLength(24);
    expect(artifact.data.evidenceLinkedCount).toBe(19);
    expect(artifact.data.leadsToVerifyCount).toBe(5);
    expect(artifact.data.creators.every((creator) => !creator.capturedAt.startsWith("2026-07"))).toBe(true);
    expect(artifact.data.creators[0].evidence).toBe(raw.creators[0].evidence);
  });

  it("separates evidence-linked creators from older profile-only leads", () => {
    expect(isEvidenceLinkedCreator(raw.creators[0])).toBe(true);
    expect(isEvidenceLinkedCreator(raw.creators.at(-1))).toBe(false);
  });
});
