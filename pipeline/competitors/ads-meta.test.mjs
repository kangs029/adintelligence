import { describe, expect, it } from "vitest";

import { buildMetaAdRecords, classifyMetaAdPage, metaAdLibraryUrl } from "./ads-meta.mjs";

describe("Meta ad sweep helpers", () => {
  it("builds a public US all-ads library search URL", () => {
    const url = new URL(metaAdLibraryUrl({ query: "Remitly" }));

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/ads/library/");
    expect(url.searchParams.get("active_status")).toBe("active");
    expect(url.searchParams.get("ad_type")).toBe("all");
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("q")).toBe("Remitly");
  });

  it("classifies empty and blocked public pages without inventing ads", () => {
    expect(classifyMetaAdPage("No ads match your search. Try another keyword.")).toEqual({
      caveat: "Meta Ad Library returned no active public ad cards for this query.",
      status: "no-public-ads-captured",
    });

    expect(classifyMetaAdPage("Log into Facebook to start sharing and connecting.")).toEqual({
      caveat: "Meta Ad Library did not expose public ad cards without an authenticated session.",
      status: "blocked",
    });

    expect(classifyMetaAdPage("Meta Ad Library Search all the ads currently running.")).toEqual({
      caveat: "Meta Ad Library public page loaded, but no parseable ad card text was exposed.",
      status: "no-public-ads-captured",
    });
  });

  it("turns a no-capture sweep into a dated artifact row", () => {
    const rows = buildMetaAdRecords({
      capturedAt: "2026-07-03T10:00:00.000Z",
      competitors: [
        {
          competitor: "Remitly",
          query: "Remitly",
          slug: "remitly",
        },
      ],
      pageResults: new Map([
        [
          "Remitly",
          {
            bodyText: "No ads match your search.",
            screenshotRawPath: "data/raw/ads/meta-remitly.png",
            sourceUrl: metaAdLibraryUrl({ query: "Remitly" }),
          },
        ],
      ]),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: "meta-remitly-2026-07-03",
        competitor: "Remitly",
        platform: "Meta",
        status: "no-public-ads-captured",
        screenshotPath: null,
        capturedAt: "2026-07-03T10:00:00.000Z",
      }),
    ]);
  });

  it("does not count generic public-library chrome as captured ad evidence", () => {
    const rows = buildMetaAdRecords({
      capturedAt: "2026-07-03T10:00:00.000Z",
      competitors: [
        {
          competitor: "Remitly",
          query: "Remitly",
          slug: "remitly",
        },
      ],
      pageResults: new Map([
        [
          "Remitly",
          {
            bodyText: "Meta Ad Library Search all the ads currently running Ad details",
            screenshotRawPath: "data/raw/ads/meta-remitly.png",
            sourceUrl: metaAdLibraryUrl({ query: "Remitly" }),
          },
        ],
      ]),
    });

    expect(rows[0]).toMatchObject({
      caveat: "Meta Ad Library public page loaded, but no parseable ad card text was exposed.",
      headline: null,
      status: "no-public-ads-captured",
    });
  });

  it("turns matching Meta ad cards into per-library snapshot rows", () => {
    const rows = buildMetaAdRecords({
      capturedAt: "2026-07-06T10:00:00.000Z",
      competitors: [
        {
          competitor: "Remitly",
          metaAdvertiserNames: ["Remitly"],
          query: "Remitly",
          slug: "remitly",
        },
      ],
      pageResults: new Map([
        [
          "Remitly",
          {
            bodyText: "Library ID: 1750307983002636",
            cards: [
              {
                libraryId: "1750307983002636",
                screenshotPath: "/evidence/ads/remitly/meta-1750307983002636.png",
                screenshotRawPath: "data/raw/ads/remitly/meta-1750307983002636.png",
                sourceUrl: metaAdLibraryUrl({ query: "Remitly" }),
                text: [
                  "Active",
                  "Library ID: 1750307983002636",
                  "Started running on Jun 17, 2026",
                  "Remitly",
                  "Sponsored",
                  "Pay vendors across borders quickly, with low fees and clear pricing.",
                  "Sign Up",
                ].join("\n"),
              },
            ],
            sourceUrl: metaAdLibraryUrl({ query: "Remitly" }),
          },
        ],
      ]),
    });

    expect(rows).toEqual([
      expect.objectContaining({
        bodyText: "Pay vendors across borders quickly, with low fees and clear pricing.",
        firstSeen: "2026-06-17",
        headline: "Pay vendors across borders quickly, with low fees and clear pricing.",
        id: "meta-remitly-1750307983002636",
        platform: "Meta",
        screenshotPath: "/evidence/ads/remitly/meta-1750307983002636.png",
        screenshotRawPath: "data/raw/ads/remitly/meta-1750307983002636.png",
        sourceUrl: "https://www.facebook.com/ads/library/?id=1750307983002636",
        status: "snapshot",
      }),
    ]);
  });
});
