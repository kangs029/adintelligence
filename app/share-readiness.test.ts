import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import anchorsArtifact from "@/data/artifacts/anchors.json";
import creatorsArtifact from "@/data/artifacts/creators.json";
import fxSnapshotsArtifact from "@/data/artifacts/fx-snapshots.json";
import marketsGeoJson from "@/data/artifacts/markets-geojson.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";
import { marketMapKpis } from "@/components/map/filtering";

function pngSize(file: string) {
  const buffer = readFileSync(file);

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

describe("share readiness", () => {
  it("keeps cross-page denominator facts artifact-backed", () => {
    const marketKpis = marketMapKpis({
      markets: marketsGeoJson as Parameters<typeof marketMapKpis>[0]["markets"],
      release: marketsArtifact.data.release,
    });
    const kpiValue = (label: string) => marketKpis.find((kpi) => kpi.label === label)?.value;
    const anchorRollupTotal = marketsArtifact.data.markets.reduce(
      (total, market) =>
        total +
        (market.anchorSummary
          ? market.anchorSummary.temples +
            market.anchorSummary.groceries +
            market.anchorSummary.cricket +
            market.anchorSummary.theaters
          : 0),
      0,
    );
    const reviewTotal = reviewThemesArtifact.data.groups.reduce(
      (total, group) => total + group.sampleSize,
      0,
    );
    const evidenceLinkedCreatorTotal =
      creatorsArtifact.data.evidenceLinkedCount ??
      creatorsArtifact.data.creators.filter((creator) => creator.group === "evidence-linked").length;
    const latestFxSnapshot = fxSnapshotsArtifact.data.snapshots.at(-1);

    expect(kpiValue("Markets tracked")).toBe(
      marketsArtifact.data.summary.includedRows.toLocaleString("en-US"),
    );
    expect(kpiValue("Launch-planning markets")).toBe("22");
    expect(kpiValue("Community anchors")).toBe(anchorsArtifact.data.anchors.length.toLocaleString("en-US"));
    expect(anchorRollupTotal).toBe(anchorsArtifact.data.anchors.length);
    expect(reviewTotal.toLocaleString("en-US")).toBe("4,452");
    expect(creatorsArtifact.data.creators).toHaveLength(24);
    expect(evidenceLinkedCreatorTotal).toBe(19);
    expect(latestFxSnapshot?.capturedAt.slice(0, 10)).toBe(
      fxSnapshotsArtifact.meta.generatedAt.slice(0, 10),
    );
  });

  it("ships a static branded OG image at the expected preview size", () => {
    expect(pngSize(join(process.cwd(), "public/og/xpat-os.png"))).toEqual({
      height: 630,
      width: 1200,
    });
  });
});
