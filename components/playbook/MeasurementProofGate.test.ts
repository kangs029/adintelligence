import { describe, expect, it } from "vitest";

import { sampleDemoStatusCopy } from "./MeasurementProofGate";

describe("sampleDemoStatusCopy", () => {
  it("matches copy to each sample-demo proof status", () => {
    expect(sampleDemoStatusCopy({ firstTransfers: 12, hasFirstTransferEvidence: true }, 10)).toBe(
      "12 demo first_transfers crosses the 10-transfer trust floor.",
    );
    expect(sampleDemoStatusCopy({ firstTransfers: 4, hasFirstTransferEvidence: true }, 10)).toBe(
      "4 demo first_transfers is below the 10-transfer trust floor.",
    );
    expect(sampleDemoStatusCopy({ firstTransfers: 0, hasFirstTransferEvidence: false }, 10)).toBe(
      "first_transfers evidence is missing, so the sample remains insufficient for the 10-transfer trust floor.",
    );
  });
});
