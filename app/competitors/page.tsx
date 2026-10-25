import {
  AdEvidenceGallery,
  type AdEvidenceArtifact,
} from "@/components/competitors/AdEvidenceGallery";
import { MarginTrend } from "@/components/competitors/MarginTrend";
import { OfferTracker, type OfferTrackerArtifact } from "@/components/competitors/OfferTracker";
import { PositioningMatrix, type PositioningCuration } from "@/components/competitors/PositioningMatrix";
import { RateTable } from "@/components/competitors/RateTable";
import { ReviewThemes, type ReviewThemesArtifact } from "@/components/competitors/ReviewThemes";
import { TodayPositionStrip } from "@/components/competitors/TodayPositionStrip";
import { WhatChangedStrip } from "@/components/competitors/WhatChangedStrip";
import { PageHeader } from "@/components/shell/PageHeader";
import competitorAdsArtifact from "@/data/artifacts/competitor-ads.json";
import competitorOffersArtifact from "@/data/artifacts/competitor-offers.json";
import fxSnapshotsArtifact from "@/data/artifacts/fx-snapshots.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";
import xpatFootprintArtifact from "@/data/artifacts/xpat-footprint.json";
import fxManualQuotes from "@/data/curation/fx-manual-quotes.json";
import positioningCuration from "@/data/curation/positioning-curated.json";
import { bestEligibleQuote } from "@/lib/data/fx-display";
import {
  snapshotFxPayload,
  type FxManualQuoteOverlay,
  type FxSnapshot,
  type FxSnapshotArtifact,
} from "@/lib/data/fx";
import { pageMetadata } from "@/lib/share-metadata";

export const metadata = pageMetadata({
  title: "Competitors · XPAT OS",
  description:
    "USD to INR competitor evidence for live rates, public positioning, ad-capture status, and app-review topic mentions.",
  path: "/competitors",
});

const initialFxPayload = snapshotFxPayload(
  fxSnapshotsArtifact as FxSnapshotArtifact,
  undefined,
  undefined,
  fxManualQuotes as FxManualQuoteOverlay,
);

function formatRate(value: number) {
  return value.toFixed(2);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function bestProvider() {
  return bestEligibleQuote(initialFxPayload.providers);
}

function xpatProvider() {
  return initialFxPayload.providers.find((provider) => provider.provider === "Xpat");
}

function adsCapturedThisMonth() {
  return competitorAdsArtifact.data.records.filter((record) => record.status === "snapshot" && record.screenshotPath)
    .length;
}

function reviewsMined() {
  return reviewThemesArtifact.data.groups.reduce((sum, group) => sum + group.sampleSize, 0);
}

export default function CompetitorsPage() {
  const best = bestProvider();
  const xpat = xpatProvider();
  const adsCaptured = adsCapturedThisMonth();
  const reviewCount = reviewsMined();

  return (
    <main className="page-wrap">
      <PageHeader
        title="Competitors"
        description="Live price position, visible creative, and public review topic mentions across the USD to INR corridor."
        stats={[
          {
            label: "Mid-market USD to INR",
            value: formatRate(initialFxPayload.midMarket.rate),
            detail: `${initialFxPayload.midMarket.source} · ${initialFxPayload.midMarket.asOf} · ECB reference, weekdays`,
          },
          {
            label: "Best available quote at $1,000",
            value: best ? formatMoney(best.receiveAmountFor1000USD) : "Connector needed",
            detail: best ? `${best.provider}, for $1,000` : "no public quote path",
          },
          {
            label: "Xpat margin vs mid",
            value:
              xpat?.effectiveMarginPctVsMid === null || xpat?.effectiveMarginPctVsMid === undefined
                ? "Quote needed"
                : `${xpat.effectiveMarginPctVsMid.toFixed(2)}%`,
            detail: xpat?.status === "connector-needed" ? "no public quote path" : "available quote",
          },
          {
            label: "Ad evidence",
            value: adsCaptured === 0 ? "pending first captures" : String(adsCaptured),
            detail: adsCaptured === 0 ? "public libraries returned no cards" : "public captures across sweeps",
            valueTone: adsCaptured === 0 ? "status" : "number",
          },
          {
            label: "Reviews mined",
            value: reviewCount.toLocaleString("en-US"),
            detail: "iOS and Android public reviews",
          },
        ]}
      />

      <TodayPositionStrip
        fxPayload={initialFxPayload}
        reviewArtifact={reviewThemesArtifact as ReviewThemesArtifact}
      />
      <RateTable initialPayload={initialFxPayload} />
      <WhatChangedStrip snapshots={fxSnapshotsArtifact.data.snapshots as FxSnapshot[]} />
      <MarginTrend snapshots={fxSnapshotsArtifact.data.snapshots as FxSnapshot[]} />
      <PositioningMatrix curation={positioningCuration as PositioningCuration} />
      <OfferTracker artifact={competitorOffersArtifact as OfferTrackerArtifact} />
      <AdEvidenceGallery
        artifact={competitorAdsArtifact as AdEvidenceArtifact}
        xpatFootprint={xpatFootprintArtifact}
      />
      <ReviewThemes artifact={reviewThemesArtifact as ReviewThemesArtifact} />
    </main>
  );
}
