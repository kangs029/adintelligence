import { describe, expect, it } from "vitest";

import {
  buildSwitchMomentsArtifact,
  isRenderableSwitchMoment,
  tagSwitchIntentExcerpt,
} from "./switch-moments.mjs";

describe("switch moment rules", () => {
  it("tags direct switch-intent phrases", () => {
    expect(tagSwitchIntentExcerpt("I switched to Wise after two failed transfers.")).toBe("switched to");
    expect(tagSwitchIntentExcerpt("Moving my transfers away this month.")).toBe("moving my transfers");
    expect(tagSwitchIntentExcerpt("I left Remitly after support stopped replying.")).toBe("left provider");
    expect(tagSwitchIntentExcerpt("I left Crobo after support stopped replying.")).toBe("left provider");
  });

  it("does not treat maintenance reinstall language as switch intent", () => {
    expect(tagSwitchIntentExcerpt("I had to uninstall and reinstall the app, then it worked.")).toBeNull();
    expect(tagSwitchIntentExcerpt("Fast and easy transfer to India.")).toBeNull();
  });

  it("filters corpus false positives without removing provider abandonment language", () => {
    expect(tagSwitchIntentExcerpt("The recipient moved to the United States.")).toBeNull();
    expect(tagSwitchIntentExcerpt("I switched to debit card and it worked.")).toBeNull();
    expect(tagSwitchIntentExcerpt("The amount field does not let me delete the number.")).toBeNull();
    expect(tagSwitchIntentExcerpt("The phone works normally after uninstalling the app.")).toBeNull();
    expect(tagSwitchIntentExcerpt("Xoom is unusable, uninstalling immediately and will find an alternative.")).toBe(
      "uninstall",
    );
    expect(tagSwitchIntentExcerpt("Worst support. I am deleting the app.")).toBe("delete");
  });

  it("does not render matched excerpts that would fail copy guardrails", () => {
    expect(isRenderableSwitchMoment("Switched to Xpat for a higher conversion rate.")).toBe(false);
    expect(isRenderableSwitchMoment("I switched to Wise after support stopped replying.")).toBe(true);
  });

  it("keeps the derived artifact traceable to real review examples", () => {
    const artifact = buildSwitchMomentsArtifact({
      generatedAt: "2026-06-02T00:00:00.000Z",
      reviews: [
        {
          competitor: "Remitly",
          date: "2026-06-01T00:00:00.000Z",
          id: "r1",
          rating: 1,
          store: "ios",
          text: "I switched to Wise after this app held my transfer.",
          title: null,
        },
        {
          competitor: "Remitly",
          date: "2026-06-01T00:00:00.000Z",
          id: "r2",
          rating: 5,
          store: "ios",
          text: "Switched to Xpat for a higher conversion rate.",
          title: null,
        },
      ],
    });

    expect(artifact.data.switchIntentCount).toBe(1);
    expect(artifact.data.scannedExcerpts).toBe(2);
    expect(artifact.data.unsafeMatchCount).toBe(1);
    expect(artifact.data.moments[0]).toMatchObject({
      excerpt: "I switched to Wise after this app held my transfer.",
      provider: "Remitly",
    });
    expect(artifact.meta.source).toBe("data/raw/reviews/latest.json");
  });
});
