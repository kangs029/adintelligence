import { describe, expect, it } from "vitest";

import {
  buildPositioningArtifact,
  extractPositioningSignals,
  mergePositioningOverlay,
  positioningRecordFromPage,
} from "./positioning.mjs";

describe("competitor positioning snapshots", () => {
  it("extracts headline, offer, fee, and speed signals from visible page text", () => {
    const signals = extractPositioningSignals({
      title: "Send money to India",
      h1: "Send money to India online",
      text: [
        "Send money to India online.",
        "New customers can use a fee-free intro offer.",
        "Delivery can arrive in minutes on selected methods.",
        "Bank transfer fees are shown before checkout.",
      ].join(" "),
    });

    expect(signals).toEqual({
      feeClaim: "New customers can use a fee-free intro offer.",
      headline: "Send money to India online",
      introOffer: "New customers can use a fee-free intro offer.",
      positioningLine: "Send money to India online.",
      speedClaim: "Delivery can arrive in minutes on selected methods.",
    });
  });

  it("strips UI affordance text and ignores short promo fragments", () => {
    const signals = extractPositioningSignals({
      title: "Remitly",
      h1: "Send money to India from the United States",
      text: [
        "One per customer.",
        "Great value Enjoy consistently great rates and no hidden fees⁠ (opens in new window).",
        "Send money online to India with delivery options and transfer status updates.",
      ].join(" "),
    });

    expect(signals.positioningLine).toBe(
      "Send money online to India with delivery options and transfer status updates.",
    );
    expect(signals.feeClaim).toBe("Great value Enjoy consistently great rates and no hidden fees.");
  });

  it("drops navigation and calculator button fragments from positioning lines", () => {
    const signals = extractPositioningSignals({
      title: "Western Union",
      h1: "Send Money to India",
      text: [
        "Send amount USD Receiver gets INR Send money now Western Union makes money from FX.",
        "Fast online money transfers with convenient pricing and rewards.",
        "Fees and rates subject to change without notice.",
      ].join(" "),
    });

    expect(signals.positioningLine).toBe(
      "Fast online money transfers with convenient pricing and rewards.",
    );
  });

  it("merges curated positioning overrides by competitor", () => {
    const profiles = [
      {
        capturedAt: "2026-07-03T00:00:00.000Z",
        caveat: null,
        competitor: "Remitly",
        feeClaim: "Great value Enjoy consistently great rates and no hidden fees⁠ (opens in new window).",
        headline: "Send money to India from the United States",
        introOffer: "One per customer.",
        landingPageUrl: "https://www.remitly.com/us/en/india",
        positioningLine: "One per customer.",
        screenshotRawPath: "data/raw/positioning/remitly.png",
        speedClaim: null,
        status: "snapshot",
      },
    ];

    expect(
      mergePositioningOverlay(profiles, [
        {
          competitor: "Remitly",
          positioningLine: "Send money to India with delivery options, status updates, and no hidden fees.",
        },
      ]),
    ).toMatchObject([
      {
        competitor: "Remitly",
        feeClaim: "Great value Enjoy consistently great rates and no hidden fees.",
        positioningLine: "Send money to India with delivery options, status updates, and no hidden fees.",
      },
    ]);
  });

  it("keeps blocked captures explicit instead of fabricating positioning", () => {
    const record = positioningRecordFromPage({
      capturedAt: "2026-07-03T10:00:00.000Z",
      competitor: {
        competitor: "Xpat",
        domain: "xpat.money",
        landingPageUrl: "https://xpat.money/",
        query: "Xpat",
        slug: "xpat",
      },
      error: new Error("HTTP 403"),
    });

    expect(record).toMatchObject({
      competitor: "Xpat",
      status: "no-public-page-captured",
      headline: null,
      caveat: "HTTP 403",
    });
  });

  it("builds a provenance-stamped positioning artifact", () => {
    const artifact = buildPositioningArtifact({
      generatedAt: "2026-07-03T00:00:00.000Z",
      profiles: [
        {
          capturedAt: "2026-07-03T00:00:00.000Z",
          caveat: null,
          competitor: "Wise",
          feeClaim: "Fees are shown before checkout.",
          headline: "Send money to India",
          introOffer: null,
          landingPageUrl: "https://wise.com/us/send-money/send-money-to-india",
          positioningLine: "Send money to India with Wise.",
          screenshotRawPath: "data/raw/positioning/wise.png",
          speedClaim: null,
          status: "snapshot",
        },
      ],
    });

    expect(artifact.meta).toMatchObject({
      family: "competitor-positioning",
      provenance: "snapshot",
      refreshCadence: "weekly manual sweep",
    });
    expect(artifact.data.profiles).toHaveLength(1);
  });
});
