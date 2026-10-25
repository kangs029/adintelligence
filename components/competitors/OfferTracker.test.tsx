import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { OfferTracker, type OfferTrackerArtifact } from "./OfferTracker";

const artifact: OfferTrackerArtifact = {
  data: {
    records: [
      {
        capturedAt: "2026-06-17",
        evidenceLabel: "Meta Ad Library keyword search",
        id: "v1-offer-03",
        observation: "India-corridor Meta ads visible",
        offer:
          "ICICI Bank - NRI Services has active Money2India creative around a 40 paise better first-transfer rate and promo IND40.",
        priority: "high",
        provider: "ICICI Money2India",
        sourceUrl: "https://www.facebook.com/ads/library/",
      },
    ],
  },
  meta: { generatedAt: "2026-07-06T23:40:00.000Z" },
};

describe("OfferTracker", () => {
  it("renders dated offer evidence without copy lint violations", () => {
    const html = renderToStaticMarkup(<OfferTracker artifact={artifact} />);

    expect(html).toContain("Offer tracker");
    expect(html).toContain(
      "Dated public offer evidence. Intro offers change frequently; re-verify before citing in a meeting.",
    );
    expect(html).toContain("ICICI Money2India");
    expect(html).toContain("promo IND40");
    expect(html).toContain("2026-06-17");
    expect(findCopyViolations(html, "components/competitors/OfferTracker.tsx")).toEqual([]);
  });
});
