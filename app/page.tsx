import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { MarketEvidenceFallback } from "@/components/map/MarketEvidenceFallback";
import { MarketMapClient } from "@/components/map/MarketMapClient";
import type { MarketsGeoJson } from "@/components/map/MapCanvas";
import marketsGeoJson from "@/data/artifacts/markets-geojson.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import { pageMetadata } from "@/lib/share-metadata";

export const metadata = pageMetadata({
  title: "Market Map · XPAT OS",
  description:
    "Interactive US market map of Asian Indian audience concentration, community anchors, and launch-planning tiers for Xpat.",
  path: "/",
});

function MapShellSkeleton() {
  return (
    <section className="map-stage map-stage-pending" aria-label="Interactive market map">
      <span>Preparing interactive map</span>
    </section>
  );
}

export default function MarketMapPage() {
  return (
    <main className="page-wrap market-page">
      <PageHeader
        title="Market Map"
        description="Where the US Asian Indian audience is, tiered by evidence. Click a market for its proof."
      />

      <Suspense fallback={<MapShellSkeleton />}>
        <MarketMapClient
          markets={marketsGeoJson as MarketsGeoJson}
          release={marketsArtifact.data.release}
        />
      </Suspense>
      <MarketEvidenceFallback
        markets={marketsGeoJson as MarketsGeoJson}
        release={marketsArtifact.data.release}
      />
    </main>
  );
}
