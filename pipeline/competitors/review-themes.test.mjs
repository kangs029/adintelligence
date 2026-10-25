import { describe, expect, it } from "vitest";

import { classifyReviewThemes, reviewThemesFromReviews, themeRules } from "./review-themes.mjs";
import { buildSwitchMomentsArtifactFromReviews } from "./switch-intent.mjs";

const fixtureReviews = [
  {
    competitor: "Remitly",
    date: "2026-07-02T00:00:00.000Z",
    id: "r1",
    rating: 2,
    store: "ios",
    text: "The exchange rate changed and the fee felt hidden.",
    title: "Rate issue",
  },
  {
    competitor: "Remitly",
    date: "2026-07-01T00:00:00.000Z",
    id: "r2",
    rating: 1,
    store: "ios",
    text: "Verification took forever and support never replied.",
    title: "Verification",
  },
  {
    competitor: "Wise",
    date: "2026-07-02T00:00:00.000Z",
    id: "w1",
    rating: 5,
    store: "android",
    text: "Fast transfer and the app did not crash.",
    title: "Fast",
  },
];

describe("review theme classifier", () => {
  it("keeps a visible rule table for all shipped themes", () => {
    expect(themeRules.map((rule) => rule.theme)).toEqual([
      "Speed",
      "Fees",
      "Rates",
      "KYC friction",
      "Trust and safety",
      "Support",
      "App bugs",
    ]);
  });

  it("classifies fixture reviews across multiple themes", () => {
    expect(classifyReviewThemes(fixtureReviews[0])).toEqual(["Fees", "Rates"]);
    expect(classifyReviewThemes(fixtureReviews[1])).toEqual(["KYC friction", "Support"]);
    expect(classifyReviewThemes(fixtureReviews[2])).toEqual(["Speed", "App bugs"]);
  });

  it("builds a dated theme artifact with counts, shares, and examples", () => {
    const artifact = reviewThemesFromReviews({
      generatedAt: "2026-07-03T00:00:00.000Z",
      reviewApps: {
        apps: [
          {
            android: { appId: "com.remitly.androidapp" },
            competitor: "Remitly",
            ios: { appId: "674258465" },
          },
          {
            android: { appId: "com.remit2any" },
            competitor: "Xpat",
            ios: { appId: "6738339464" },
          },
        ],
      },
      reviews: fixtureReviews,
    });

    const remitly = artifact.data.groups.find(
      (group) => group.competitor === "Remitly" && group.store === "ios",
    );

    expect(artifact.meta).toMatchObject({
      family: "review-themes",
      provenance: "snapshot",
    });
    expect(remitly.sampleSize).toBe(2);
    expect(remitly.averageRating).toBe(1.5);
    expect(remitly.themes.find((theme) => theme.theme === "Fees")).toMatchObject({
      count: 1,
      sharePct: 50,
    });
    expect(remitly.themes.find((theme) => theme.theme === "Support").examples[0]).toMatchObject({
      rating: 1,
      text: "Verification took forever and support never replied.",
    });
    expect(artifact.data.groups.find((group) => group.competitor === "Wise").themes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          count: 1,
          examples: [],
          theme: "Speed",
        }),
      ]),
    );
    expect(
      artifact.data.groups.find((group) => group.competitor === "Xpat" && group.store === "ios"),
    ).toMatchObject({
      averageRating: null,
      sampleSize: 0,
      window: { from: null, to: null },
    });
  });

  it("keeps positive review matches out of displayed evidence examples", () => {
    const artifact = reviewThemesFromReviews({
      generatedAt: "2026-07-03T00:00:00.000Z",
      reviewApps: { apps: [] },
      reviews: [
        {
          competitor: "Remitly",
          date: "2026-07-02T00:00:00.000Z",
          id: "positive",
          rating: 5,
          store: "ios",
          text: "Fast transfer, low fees, and no app issues.",
          title: "Great",
        },
        {
          competitor: "Remitly",
          date: "2026-07-01T00:00:00.000Z",
          id: "negative",
          rating: 2,
          store: "ios",
          text: "Slow transfer and a fee surprise.",
          title: "Bad",
        },
      ],
    });

    const remitly = artifact.data.groups.find(
      (group) => group.competitor === "Remitly" && group.store === "ios",
    );
    const speed = remitly.themes.find((theme) => theme.theme === "Speed");

    expect(speed).toMatchObject({ count: 2, sharePct: 100 });
    expect(speed.examples).toHaveLength(1);
    expect(speed.examples[0]).toMatchObject({
      id: "negative",
      rating: 2,
      text: "Slow transfer and a fee surprise.",
    });
  });

  it("can derive switch moments from the full review fixture before examples are capped", () => {
    const artifact = buildSwitchMomentsArtifactFromReviews({
      classifyThemes: classifyReviewThemes,
      generatedAt: "2026-07-03T00:00:00.000Z",
      reviews: [
        ...fixtureReviews,
        {
          competitor: "Xoom",
          date: "2026-07-03T00:00:00.000Z",
          id: "x1",
          rating: 1,
          store: "android",
          text: "I am moving my transfers after this verification loop.",
          title: "Verification loop",
        },
      ],
    });

    expect(artifact.data.scannedExcerpts).toBe(4);
    expect(artifact.data.switchIntentCount).toBe(1);
    expect(artifact.data.moments[0]).toMatchObject({
      matchedPattern: "moving my transfers",
      provider: "Xoom",
      store: "android",
      theme: "KYC friction",
    });
  });
});
