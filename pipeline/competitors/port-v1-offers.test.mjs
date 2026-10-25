import { describe, expect, it } from "vitest";

import { buildOfferTrackerArtifact } from "./port-v1-offers.mjs";

describe("v1 offer tracker port", () => {
  it("ports v1 competitor signals with original capture dates", () => {
    const artifact = buildOfferTrackerArtifact({
      generatedAt: "2026-07-06T23:40:00.000Z",
      source: {
        signals: [
          {
            capturedAt: "2026-06-17",
            competitor: "ICICI Money2India",
            detail:
              "ICICI Bank - NRI Services has active Money2India creative around a 40 paise better first-transfer rate and promo IND40.",
            link: "https://www.facebook.com/ads/library/",
            priority: "high",
            signal: "India-corridor Meta ads visible",
            sourceLabel: "Meta Ad Library keyword search",
          },
        ],
      },
    });

    expect(artifact.meta).toMatchObject({
      family: "competitor-offers",
      provenance: "snapshot",
      source: "data/raw/v1-port/competitors.json",
    });
    expect(artifact.data.records).toEqual([
      {
        capturedAt: "2026-06-17",
        evidenceLabel: "Meta Ad Library keyword search",
        id: "v1-offer-01",
        observation: "India-corridor Meta ads visible",
        offer:
          "ICICI Bank - NRI Services has active Money2India creative around a 40 paise better first-transfer rate and promo IND40.",
        priority: "high",
        provider: "ICICI Money2India",
        sourceUrl: "https://www.facebook.com/ads/library/",
      },
    ]);
  });
});
