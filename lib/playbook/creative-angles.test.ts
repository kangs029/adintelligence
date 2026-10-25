import { describe, expect, it } from "vitest";

import { CREATIVE_ANGLE_TEMPLATES } from "./creative-angles";

describe("creative angle evidence links", () => {
  it("points review-theme evidence at the competitors review section", () => {
    const reviewThemeAngles = CREATIVE_ANGLE_TEMPLATES.filter((template) =>
      template.groundingSignal.label.toLowerCase().includes("review"),
    );

    expect(reviewThemeAngles.length).toBeGreaterThan(0);
    expect(reviewThemeAngles.every((template) => template.groundingSignal.href.startsWith("/competitors#review-themes-title"))).toBe(true);
  });

  it("uses existing evidence section anchors", () => {
    expect(CREATIVE_ANGLE_TEMPLATES.map((template) => template.groundingSignal.href)).toEqual(
      expect.arrayContaining([
        "/signals#community-threads-title",
        "/competitors#positioning-matrix-title",
      ]),
    );
    expect(CREATIVE_ANGLE_TEMPLATES.map((template) => template.groundingSignal.href)).not.toEqual(
      expect.arrayContaining(["/signals#community-threads", "/competitors#positioning-title"]),
    );
  });
});
