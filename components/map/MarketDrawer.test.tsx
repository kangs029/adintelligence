import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { MarketDrawer } from "./MarketDrawer";

const detail = {
  anchorRows: [
    {
      id: "31000US42660:node/1",
      kind: "temple",
      displayName: "Seattle Temple",
      name: "Seattle Temple",
      lat: 47.1,
      lng: -122.1,
      osmUrl: "https://www.openstreetmap.org/node/1",
      qaFlags: [],
    },
  ],
  anchorTotal: 3,
  cinema: {
    capturedAt: "2026-06-20",
    exampleTheaters: ["Regal Meridian", "AMC Pacific Place 11"],
    languageSummary: "Telugu, Tamil",
    theaterSignalCount: 2,
  },
  market: {
    anchorSummary: { temples: 1, groceries: 1, cricket: 1, theaters: 0, per10kAI: 0.3 },
    concentration: { localSharePct: 3.6, multipleOfUS: 2.6 },
    geoid: "31000US42660",
    moeReliability: "high",
    name: "Seattle-Tacoma-Bellevue",
    population: { asianIndian: 147_389, moe: 4_597 },
    score: 77.6,
    state: "WA",
    tier: 1,
  },
  personaInsights: [
    {
      href: "/playbook?market=31000US42660#personas",
      text: "Cricket density 4.0x the Tier 1/2 median. Evidence for the young professional persona.",
    },
  ],
};

describe("MarketDrawer", () => {
  it("renders cinema signals instead of OSM theater anchor counts", () => {
    const html = renderToStaticMarkup(
      <MarketDrawer detail={detail as never} onAnchorFocus={() => {}} onClose={() => {}} />,
    );

    expect(html).toContain("2 theater signals, city level");
    expect(html).toContain("Telugu, Tamil");
    expect(html).toContain("SNAPSHOT");
    expect(html).not.toContain("0 theater anchors (OSM)");
    expect(html).not.toContain("theater anchors (OSM)");
    expect(html).toContain("Tiers are scored from ACS population scale");
    expect(html).toContain("What this mix suggests");
    expect(html).toContain("Evidence for the young professional persona.");
    expect(findCopyViolations(html, "components/map/MarketDrawer.tsx")).toEqual([]);
  });
});
