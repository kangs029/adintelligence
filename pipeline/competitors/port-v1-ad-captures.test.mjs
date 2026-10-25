import { describe, expect, it } from "vitest";

import { buildV1AdCaptureRecords } from "./port-v1-ad-captures.mjs";

describe("v1 ad capture port", () => {
  it("ports June 17 records with original dates and image-backed context rows", () => {
    const records = buildV1AdCaptureRecords();

    expect(records.filter((record) => record.id.startsWith("v1-ad_"))).toHaveLength(5);
    expect(records.filter((record) => record.screenshotPath)).toHaveLength(13);
    expect(new Set(records.map((record) => record.capturedAt))).toEqual(new Set(["2026-06-17"]));
    expect(records).toContainEqual(
      expect.objectContaining({
        competitor: "Xpat",
        evidenceRole: "owned benchmark",
        headline: "Send Money from USD to INR - Instant Transfers With $0 Fees",
        screenshotPath: "/evidence/ads/june-2026/xpat-google-cr08845692618802200577.png",
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        competitor: "MoneyGram",
        evidenceRole: "category context",
        screenshotPath: "/evidence/ads/june-2026/moneygram-google-cr09972801713557471233.png",
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        competitor: "Remitly",
        headline: null,
        screenshotPath: "/evidence/ads/june-2026/remitly-google-cr16795721931746705409.png",
      }),
    );
  });
});
