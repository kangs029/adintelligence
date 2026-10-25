import { describe, expect, it } from "vitest";

import {
  buildGoogleAdRecords,
  classifyGoogleAdPage,
  googleAdsTransparencyUrl,
} from "./ads-google.mjs";

describe("Google ads transparency sweep helpers", () => {
  it("builds a public US Transparency Center URL", () => {
    const url = new URL(googleAdsTransparencyUrl({ domain: "wise.com" }));

    expect(url.origin).toBe("https://adstransparency.google.com");
    expect(url.searchParams.get("region")).toBe("US");
    expect(url.searchParams.get("domain")).toBe("wise.com");
  });

  it("classifies empty and blocked public pages without inventing ads", () => {
    expect(classifyGoogleAdPage("No ads found for this advertiser.")).toEqual({
      caveat: "Google Ads Transparency Center returned no public ad cards for this advertiser.",
      status: "no-public-ads-captured",
    });

    expect(classifyGoogleAdPage("This browser or app may not be secure.")).toEqual({
      caveat: "Google Ads Transparency Center did not expose public ad cards to this browser run.",
      status: "blocked",
    });

    expect(classifyGoogleAdPage("Ads Transparency Center Political ads Election ads")).toEqual({
      caveat:
        "Google Ads Transparency Center public page loaded, but no parseable ad card text was exposed.",
      status: "no-public-ads-captured",
    });
  });

  it("turns a no-capture sweep into a dated artifact row", () => {
    const rows = buildGoogleAdRecords({
      capturedAt: "2026-07-03T10:00:00.000Z",
      competitors: [
        {
          competitor: "Wise",
          domain: "wise.com",
          slug: "wise",
        },
      ],
      pageResults: new Map([
        [
          "Wise",
          {
            bodyText: "No ads found for this advertiser.",
            screenshotRawPath: "data/raw/ads/google-wise.png",
            sourceUrl: googleAdsTransparencyUrl({ domain: "wise.com" }),
          },
        ],
      ]),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "google-wise-2026-07-03",
        competitor: "Wise",
        platform: "Google",
        status: "no-public-ads-captured",
        screenshotPath: null,
        capturedAt: "2026-07-03T10:00:00.000Z",
      }),
    ]);
  });

  it("turns Google creative details into per-creative snapshot rows", () => {
    const rows = buildGoogleAdRecords({
      capturedAt: "2026-07-06T10:00:00.000Z",
      competitors: [
        {
          competitor: "Remitly",
          domain: "remitly.com",
          slug: "remitly",
        },
      ],
      pageResults: new Map([
        [
          "Remitly",
          {
            bodyText: "Ad details\nLast shown: Jul 6, 2026\nFormat: Text",
            cards: [
              {
                bodyText: "We've Sent $15+ Billion Worldwide with No Hidden Fees.",
                creativeId: "CR11848711134867619841",
                headline: "Remitly: Send More Money Home - Remitly Money Transfers",
                lastShown: "2026-07-06",
                mediaType: "Text",
                placement: "Shown in the United States",
                screenshotPath: "/evidence/ads/remitly/google-CR11848711134867619841.png",
                screenshotRawPath: "data/raw/ads/remitly/google-CR11848711134867619841.png",
                sourceUrl:
                  "https://adstransparency.google.com/advertiser/AR10100061036192202753/creative/CR11848711134867619841?region=US",
              },
            ],
            sourceUrl: googleAdsTransparencyUrl({ domain: "remitly.com" }),
          },
        ],
      ]),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        bodyText: "We've Sent $15+ Billion Worldwide with No Hidden Fees.",
        headline: "Remitly: Send More Money Home - Remitly Money Transfers",
        id: "google-remitly-CR11848711134867619841",
        lastShown: "2026-07-06",
        mediaType: "Text",
        placement: "Shown in the United States",
        platform: "Google",
        screenshotPath: "/evidence/ads/remitly/google-CR11848711134867619841.png",
        screenshotRawPath: "data/raw/ads/remitly/google-CR11848711134867619841.png",
        status: "snapshot",
      }),
    ]);
  });
});
