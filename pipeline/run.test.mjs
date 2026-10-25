import { describe, expect, it } from "vitest";

import { runSignalsEvidence, shouldRestorePortedSignalEvidence } from "./run.mjs";

describe("pipeline run orchestration", () => {
  it("restores ported signal evidence when live connectors are blocked", async () => {
    const calls = [];

    await runSignalsEvidence({
      runCreatorsFn: async () => ({ data: { status: "connector-needed" } }),
      runGeoVisibilityFn: async () => calls.push("geo"),
      runSwitchMomentsFn: async () => calls.push("switch"),
      runThreadsFn: async () => ({ data: { status: "blocked" } }),
      runV1CreatorsPortFn: async () => calls.push("creators-port"),
      runV1ThreadsPortFn: async () => calls.push("threads-port"),
      runXpatFootprintPortFn: async () => calls.push("footprint"),
    });

    expect(calls).toEqual(["threads-port", "creators-port", "switch", "geo", "footprint"]);
  });

  it("does not overwrite ok live signal connector artifacts with v1 ports", async () => {
    const calls = [];

    await runSignalsEvidence({
      runCreatorsFn: async () => ({ data: { status: "ok" } }),
      runGeoVisibilityFn: async () => calls.push("geo"),
      runSwitchMomentsFn: async () => calls.push("switch"),
      runThreadsFn: async () => ({ data: { status: "ok" } }),
      runV1CreatorsPortFn: async () => calls.push("creators-port"),
      runV1ThreadsPortFn: async () => calls.push("threads-port"),
      runXpatFootprintPortFn: async () => calls.push("footprint"),
    });

    expect(calls).toEqual(["switch", "geo", "footprint"]);
  });

  it("treats missing or non-ok status as needing ported evidence", () => {
    expect(shouldRestorePortedSignalEvidence(undefined)).toBe(true);
    expect(shouldRestorePortedSignalEvidence({ data: { status: "blocked" } })).toBe(true);
    expect(shouldRestorePortedSignalEvidence({ data: { status: "ok" } })).toBe(false);
  });
});
