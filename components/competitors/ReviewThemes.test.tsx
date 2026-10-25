import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { ReviewThemes } from "./ReviewThemes";

const artifact = {
  data: {
    groups: [
      {
        competitor: "Remitly",
        sampleSize: 2,
        store: "ios",
        themes: [
          {
            count: 1,
            examples: [
              {
                date: "2026-07-02T00:00:00.000Z",
                id: "r1",
                rating: 2,
                store: "ios",
                text: "The exchange rate changed and the fee felt hidden.",
                title: "Rate issue",
              },
              {
                date: "2026-07-01T00:00:00.000Z",
                id: "r2",
                rating: 5,
                store: "ios",
                text: "The fee was transparent and the app worked well.",
                title: "Helpful",
              },
            ],
            sharePct: 50,
            theme: "Fees",
          },
        ],
        window: { from: "2026-07-01", to: "2026-07-02" },
      },
    ],
  },
  meta: { generatedAt: "2026-07-03T00:00:00.000Z" },
};

describe("ReviewThemes", () => {
  it("renders review theme bars and real excerpts without claim violations", () => {
    const html = renderToStaticMarkup(<ReviewThemes artifact={artifact} />);

    expect(html).toContain("Review themes");
    expect(html).toContain("Keyword-topic counts");
    expect(html).toContain("Remitly");
    expect(html).toContain("The exchange rate changed");
    expect(html).not.toContain("The fee was transparent");
    expect(html).toContain("2 reviews");
    expect(html).toContain("Basis: iOS 2; captured window 2026-07-01 to 2026-07-02");
    expect(html).toContain("50% · n=2");
    expect(html).toContain("1 non-positive excerpt");
    expect(html).not.toContain("Weakest");
    expect(findCopyViolations(html, "components/competitors/ReviewThemes.tsx")).toEqual([]);
  });
});
