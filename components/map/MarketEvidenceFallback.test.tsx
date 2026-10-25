import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import marketsGeoJson from "@/data/artifacts/markets-geojson.json";
import { validateClaims } from "@/lib/claims/contract";
import {
  STATIC_MAP_FALLBACK_COPY,
  TIER_RATIONALE_COPY,
  TIER_ONE_RATIONALE_COPY,
  TOUR_STATIC_HINT_COPY,
} from "@/lib/map/tier-rationale";
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import type { MarketsGeoJson } from "./MapCanvas";
import { fallbackMarketRows, MarketEvidenceFallback } from "./MarketEvidenceFallback";

describe("MarketEvidenceFallback", () => {
  it("renders useful static evidence instead of a loading-only state", () => {
    const html = renderToStaticMarkup(
      <MarketEvidenceFallback
        markets={marketsGeoJson as MarketsGeoJson}
        release="ACS 2024 5-year"
      />,
    );

    expect(html).toContain("Launch planning evidence");
    expect(html).toContain("Why Tier 1");
    expect(html).toContain("Trenton-Princeton");
    expect(html).toContain("San Jose-Sunnyvale-Santa Clara");
    expect(html).toContain("Open playbook");
    expect(html).not.toContain("If the interactive map has not loaded");
    expect(html).not.toContain("Static evidence fallback");
    expect(html).not.toContain("Loading market map");
  });

  it("sorts committed Tier 1 markets by score for the fallback table", () => {
    const rows = fallbackMarketRows(marketsGeoJson as MarketsGeoJson, 4);

    expect(rows.map((row) => row.name)).toEqual([
      "Trenton-Princeton",
      "San Jose-Sunnyvale-Santa Clara",
      "New York-Newark-Jersey City",
      "San Francisco-Oakland-Fremont",
    ]);
    expect(rows.every((row, index) => index === 0 || row.score <= rows[index - 1].score)).toBe(
      true,
    );
  });

  it("keeps fallback and rationale copy inside the claim contract", () => {
    const copy = {
      fallback: STATIC_MAP_FALLBACK_COPY,
      drawerRationale: TIER_RATIONALE_COPY,
      rationale: TIER_ONE_RATIONALE_COPY,
      tour: TOUR_STATIC_HINT_COPY,
    };

    const html = renderToStaticMarkup(
      <MarketEvidenceFallback
        markets={marketsGeoJson as MarketsGeoJson}
        release="ACS 2024 5-year"
      />,
    );

    expect(validateClaims(copy, "copy")).toEqual([]);
    expect(findCopyViolations(html, "components/map/MarketEvidenceFallback.tsx")).toEqual([]);
  });
});
