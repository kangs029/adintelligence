import { describe, expect, it } from "vitest";

import {
  appleReviewsUrl,
  normalizeAppleReviewEntry,
  normalizeGoogleReview,
} from "./reviews.mjs";

describe("review source normalization", () => {
  it("builds the public Apple customer review RSS URL", () => {
    const url = new URL(appleReviewsUrl({ appId: "674258465", page: 2 }));

    expect(url.origin).toBe("https://itunes.apple.com");
    expect(url.pathname).toBe("/us/rss/customerreviews/page=2/id=674258465/sortby=mostrecent/json");
  });

  it("normalizes an Apple RSS review entry", () => {
    const entry = {
      author: { name: { label: "Reviewer" } },
      content: { label: "Fast transfer but support was slow." },
      id: { label: "123" },
      "im:rating": { label: "4" },
      "im:version": { label: "1.2.3" },
      link: { attributes: { href: "https://apps.apple.com/review/123" } },
      title: { label: "Good app" },
      updated: { label: "2026-07-02T10:00:00-07:00" },
    };

    expect(
      normalizeAppleReviewEntry({
        appId: "674258465",
        competitor: "Remitly",
        entry,
      }),
    ).toEqual({
      appId: "674258465",
      author: "Reviewer",
      competitor: "Remitly",
      date: "2026-07-02T17:00:00.000Z",
      id: "123",
      rating: 4,
      store: "ios",
      text: "Fast transfer but support was slow.",
      title: "Good app",
      url: "https://apps.apple.com/review/123",
      version: "1.2.3",
    });
  });

  it("normalizes a Google Play scraper review", () => {
    expect(
      normalizeGoogleReview({
        appId: "com.remitly.androidapp",
        competitor: "Remitly",
        review: {
          date: "2026-07-02T08:38:06.167Z",
          id: "abc",
          score: 5,
          text: "Quick and reliable.",
          title: null,
          url: "https://play.google.com/review",
          userName: "A User",
          version: "6.69",
        },
      }),
    ).toMatchObject({
      appId: "com.remitly.androidapp",
      competitor: "Remitly",
      date: "2026-07-02T08:38:06.167Z",
      id: "abc",
      rating: 5,
      store: "android",
      text: "Quick and reliable.",
    });
  });
});
