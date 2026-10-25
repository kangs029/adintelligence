import anchorsArtifact from "@/data/artifacts/anchors.json";
import channelsArtifact from "@/data/artifacts/channels.json";
import cinemaArtifact from "@/data/artifacts/cinema.json";
import communityThreadsArtifact from "@/data/artifacts/community-threads.json";
import competitorAdsArtifact from "@/data/artifacts/competitor-ads.json";
import competitorOffersArtifact from "@/data/artifacts/competitor-offers.json";
import competitorPositioningArtifact from "@/data/artifacts/competitor-positioning.json";
import corridorContextArtifact from "@/data/artifacts/corridor-context.json";
import creatorSponsorExamplesArtifact from "@/data/artifacts/creator-sponsor-examples.json";
import creatorsArtifact from "@/data/artifacts/creators.json";
import employmentArtifact from "@/data/artifacts/employment.json";
import fxHistoryArtifact from "@/data/artifacts/fx-history.json";
import fxSnapshotsArtifact from "@/data/artifacts/fx-snapshots.json";
import geoVisibilityArtifact from "@/data/artifacts/geo-visibility.json";
import marketBriefsArtifact from "@/data/artifacts/market-briefs.json";
import marketsAuditArtifact from "@/data/artifacts/markets-audit.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import personasArtifact from "@/data/artifacts/personas.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";
import studentsArtifact from "@/data/artifacts/students.json";
import switchMomentsArtifact from "@/data/artifacts/switch-moments.json";
import xpatAdPerformanceArtifact from "@/data/artifacts/xpat-ad-performance.json";
import xpatFootprintArtifact from "@/data/artifacts/xpat-footprint.json";
import type { Provenance } from "@/components/shell/ProvenanceChip";

export type ArtifactMeta = {
  caveats: string[];
  family: string;
  file: string;
  generatedAt: string;
  method: string;
  provenance: Provenance;
  refreshCadence: string;
  source: string;
};

type JsonArtifactMeta = Omit<ArtifactMeta, "file" | "provenance"> & {
  provenance: string;
};

type JsonArtifact = {
  meta: JsonArtifactMeta;
};

const artifactRows: Array<{ artifact: JsonArtifact; file: string }> = [
  { artifact: anchorsArtifact, file: "anchors.json" },
  { artifact: channelsArtifact, file: "channels.json" },
  { artifact: cinemaArtifact, file: "cinema.json" },
  { artifact: communityThreadsArtifact, file: "community-threads.json" },
  { artifact: competitorAdsArtifact, file: "competitor-ads.json" },
  { artifact: competitorOffersArtifact, file: "competitor-offers.json" },
  { artifact: competitorPositioningArtifact, file: "competitor-positioning.json" },
  { artifact: corridorContextArtifact, file: "corridor-context.json" },
  { artifact: creatorSponsorExamplesArtifact, file: "creator-sponsor-examples.json" },
  { artifact: creatorsArtifact, file: "creators.json" },
  { artifact: employmentArtifact, file: "employment.json" },
  { artifact: fxHistoryArtifact, file: "fx-history.json" },
  { artifact: fxSnapshotsArtifact, file: "fx-snapshots.json" },
  { artifact: geoVisibilityArtifact, file: "geo-visibility.json" },
  { artifact: marketBriefsArtifact, file: "market-briefs.json" },
  { artifact: marketsAuditArtifact, file: "markets-audit.json" },
  { artifact: marketsArtifact, file: "markets.json" },
  { artifact: personasArtifact, file: "personas.json" },
  { artifact: reviewThemesArtifact, file: "review-themes.json" },
  { artifact: studentsArtifact, file: "students.json" },
  { artifact: switchMomentsArtifact, file: "switch-moments.json" },
  { artifact: xpatAdPerformanceArtifact as unknown as JsonArtifact, file: "xpat-ad-performance.json" },
  { artifact: xpatFootprintArtifact, file: "xpat-footprint.json" },
];

const marketsProjectionRow: ArtifactMeta = {
  caveats: [
    "Projection only. Values trace to markets.json and are formatted for MapLibre rendering.",
  ],
  family: "markets-geojson",
  file: "markets-geojson.json",
  generatedAt: marketsArtifact.meta.generatedAt,
  method: "Derived GeoJSON projection of the scored markets artifact for the map canvas.",
  provenance: "derived",
  refreshCadence: marketsArtifact.meta.refreshCadence,
  source: "data/artifacts/markets.json",
};

export function artifactMetadata(): ArtifactMeta[] {
  return [
    ...artifactRows.map(({ artifact, file }) => ({
      ...artifact.meta,
      file,
      provenance: artifact.meta.provenance as Provenance,
    })),
    marketsProjectionRow,
  ].sort((left, right) => left.family.localeCompare(right.family));
}

export function displayArtifactFile(file: string) {
  return file.replace(/\.json$/u, "");
}

export function displayArtifactCadence(cadence: string) {
  const trimmed = cadence.trim();

  if (trimmed === "daily or before demos") {
    return "daily";
  }

  if (trimmed === "manual v1 port") {
    return "curated import, dated";
  }

  return trimmed
    .replace(/\bweekly manual sweep\b/giu, "weekly operator-verified sweep")
    .replace(/\bmonthly manual capture\b/giu, "monthly operator-verified capture")
    .replace(
      /\bweekly manual ad library review\b/giu,
      "weekly operator-verified ad-library review",
    )
    .replace(/\bmanual when\b/giu, "operator-verified when")
    .replace(/\bmanual\b/giu, "operator-verified")
    .replace(/\bOFLC\b/gu, "H-1B LCA");
}

export function displayArtifactMethod(method: string) {
  return method
    .replace(/\bManual capture grid\b/gu, "Operator-verified capture grid")
    .replace(
      /\bcurated manual public-page quote overlay\b/gu,
      "curated operator-verified public-page quote overlay",
    )
    .replace(/\bPorted from v1\b/gu, "Curated import from v1")
    .replace(/\bPort v1\b/gu, "Curated import of v1")
    .replace(/\bmanual\b/giu, "operator-verified");
}

export function displayArtifactSource(source: string) {
  return source.replace(
    /\bDOL OFLC LCA disclosure data\b/gu,
    "DOL H-1B employer filings (LCA)",
  );
}

export function latestGeneratedAt(rows: ArtifactMeta[] = artifactMetadata()) {
  return rows
    .map((row) => row.generatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

export function formatArtifactDate(value: string | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}
