import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import anchorsArtifact from "@/data/artifacts/anchors.json";
import channelsArtifact from "@/data/artifacts/channels.json";
import cinemaArtifact from "@/data/artifacts/cinema.json";
import communityThreadsRaw from "@/data/artifacts/community-threads.json";
import type { CommunityThreadsArtifact } from "@/components/signals/CommunityThreads";

const communityThreadsArtifact = communityThreadsRaw as unknown as CommunityThreadsArtifact;
import competitorAdsArtifact from "@/data/artifacts/competitor-ads.json";
import competitorPositioningArtifact from "@/data/artifacts/competitor-positioning.json";
import corridorContextArtifact from "@/data/artifacts/corridor-context.json";
import creatorSponsorExamplesArtifact from "@/data/artifacts/creator-sponsor-examples.json";
import creatorsArtifact from "@/data/artifacts/creators.json";
import fxHistoryArtifact from "@/data/artifacts/fx-history.json";
import geoVisibilityArtifact from "@/data/artifacts/geo-visibility.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import personasArtifact from "@/data/artifacts/personas.json";
import reviewThemesArtifact from "@/data/artifacts/review-themes.json";
import seasonalCalendar from "@/data/curation/seasonal-calendar.json";
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { PlaybookDossier } from "./PlaybookDossier";
import { buildDossierForMarket } from "@/lib/playbook/dossier";
import PlaybookPage from "@/app/playbook/page";

describe("PlaybookDossier", () => {
  function buildDossier(geoid = "31000US41940") {
    return buildDossierForMarket({
      anchors: anchorsArtifact.data.anchors,
      channels: channelsArtifact.data.channels,
      cinemaSignals: cinemaArtifact.data.theaterSignals,
      communityThreads: communityThreadsArtifact.data.threads,
      competitorAds: competitorAdsArtifact.data.records,
      corridorContext: corridorContextArtifact.data,
      creators: creatorsArtifact.data.creators,
      fxHistory: fxHistoryArtifact.data,
      geoVisibility: geoVisibilityArtifact.data,
      marketGeoid: geoid,
      markets: marketsArtifact.data.markets,
      monitorQueues: communityThreadsArtifact.data.monitorQueues,
      nationalAsianIndian: marketsArtifact.data.summary.nationalAsianIndian,
      personas: personasArtifact.data.personas,
      positioningProfiles: competitorPositioningArtifact.data.profiles,
      reviewThemes: reviewThemesArtifact.data.groups,
      seasonalMoments: seasonalCalendar.moments,
      seasonalNow: new Date("2026-07-06T00:00:00.000Z"),
      sponsorExamples: creatorSponsorExamplesArtifact.data.examples,
      sponsorSignalsHref: creatorSponsorExamplesArtifact.data.signalsHref,
    });
  }

  it("renders the complete dossier sections for a demo market", () => {
    const dossier = buildDossier();
    const html = renderToStaticMarkup(<PlaybookDossier dossier={dossier} />);

    expect(html).toContain("Market wedge");
    expect(html).toContain("Market snapshot");
    expect(html).toContain("Corridor plays, apply in every market");
    expect(html).toContain("Personas");
    expect(html).toContain("Channel plan");
    expect(html).toContain("Where to point digital ads");
    expect(html).toContain("Content topics and reply angles");
    expect(html).toContain("Sunnyvale community setup card");
    expect(html).toContain("Copy-ready asset");
    expect(html).toContain("Offline surfaces");
    expect(html).toContain("Experiment plan");
    expect(html).toContain("Creative angles");
    expect(html).toContain("Measurement spec");
    expect(html).toContain("What we need from Xpat");
    expect(html).toContain("From evidence to proof");
    expect(findCopyViolations(html, "components/playbook/PlaybookDossier.tsx")).toEqual([]);
  });

  it("renders readable benchmarks, contributions, and thresholds", () => {
    const dossier = buildDossier();
    const html = renderToStaticMarkup(<PlaybookDossier dossier={dossier} />);

    expect(html).toContain("Reference market");
    expect(html).toContain("Dallas planning comparator");
    expect(html).not.toContain("Benchmark reference market:");
    expect(html).not.toMatch(/Population: \d/);
    expect(html).toContain("Fit score");
    expect(html).toContain("Score math");
    expect(html).toContain("large audience base");
    expect(html).toContain("Primary metric");
    expect(html).toContain("Threshold set with Xpat at kickoff");
    expect(html).toContain("Does not prove downstream acquisition economics");
    expect(html).toContain("Meta community education");
    expect(html).toContain("counter-move");
    expect(html).toContain("Buyable geo pack");
    expect(html).toContain("Platform routing by persona");
    expect(html).toContain("Public ad libraries show competitor creative, not where it delivers");
    expect(html).toContain("data ask #5");
    expect(html).toContain("Sample data for demo");
    expect(html).toContain("Rows marked sample_data can demonstrate the trust-floor flip");
    expect(html).toContain("First-transfer evidence not provided yet");
    expect(html).not.toContain("0 owned first transfers");
    expect(html).not.toContain("Livingston");
  });

  it("renders selected-market KPIs instead of developer status tiles", async () => {
    const sanJoseRollup = anchorsArtifact.data.marketRollups["31000US41940"];
    const anchorTotal =
      sanJoseRollup.temples +
      sanJoseRollup.groceries +
      sanJoseRollup.cricket +
      sanJoseRollup.theaters;
    const html = renderToStaticMarkup(
      await PlaybookPage({
        searchParams: Promise.resolve({ market: "31000US41940" }),
      }),
    );

    expect(html).toContain("Asian Indian population");
    expect(html).toContain("Multiple of US share");
    expect(html).toContain("Community places");
    expect(html).toContain(`${anchorTotal} total`);
    expect(html).toContain("0 OSM theaters, cinema signal present");
    expect(html).toContain("Reference market");
    expect(html).toContain("Claim contract active");
    expect(html).toContain("Derived corridor estimate");
    expect(html).toContain("Census method: ACS 2024 5-year detailed table B02015");
    expect(html).toContain("Where to point digital ads");
    expect(html).toContain("Copy geo pack");
    expect(html).not.toContain("Dossier builder");
    expect(html).not.toContain("Claim contract</div>");
  });

  it("renders exact connector-needed owned-data schemas", () => {
    const dossier = buildDossier();
    const html = renderToStaticMarkup(<PlaybookDossier dossier={dossier} />);

    expect(html).toContain("market_geoid");
    expect(html).toContain("conversions");
    expect(html).toContain("first_transfers");
    expect(html).toContain("baseline_group");
    expect(html).toContain("install_id");
    expect(html).toContain("first_transfer_outcome");
    expect(html).toContain("Google Ads Auction Insights by geo");
    expect(html).toContain("competitor_domain");
  });

  it("renders connector-needed rate timing when FX history is unavailable", () => {
    const dossier = {
      ...buildDossier(),
      fxHistory: null,
    };
    const html = renderToStaticMarkup(<PlaybookDossier dossier={dossier} />);

    expect(html).toContain("FX history needs refresh");
    expect(html).toContain("CONNECTOR NEEDED");
    expect(html).not.toContain("Frankfurter historical rates");
  });

  it("renders connector-needed corridor state when corridor context is unavailable", () => {
    const dossier = buildDossierForMarket({
      anchors: anchorsArtifact.data.anchors,
      channels: channelsArtifact.data.channels,
      cinemaSignals: cinemaArtifact.data.theaterSignals,
      communityThreads: communityThreadsArtifact.data.threads,
      competitorAds: competitorAdsArtifact.data.records,
      corridorContext: null,
      creators: creatorsArtifact.data.creators,
      fxHistory: fxHistoryArtifact.data,
      geoVisibility: geoVisibilityArtifact.data,
      marketGeoid: "31000US41940",
      markets: marketsArtifact.data.markets,
      monitorQueues: communityThreadsArtifact.data.monitorQueues,
      nationalAsianIndian: marketsArtifact.data.summary.nationalAsianIndian,
      personas: personasArtifact.data.personas,
      positioningProfiles: competitorPositioningArtifact.data.profiles,
      reviewThemes: reviewThemesArtifact.data.groups,
      seasonalMoments: seasonalCalendar.moments,
      seasonalNow: new Date("2026-07-06T00:00:00.000Z"),
      sponsorExamples: creatorSponsorExamplesArtifact.data.examples,
      sponsorSignalsHref: creatorSponsorExamplesArtifact.data.signalsHref,
    });
    const html = renderToStaticMarkup(<PlaybookDossier dossier={dossier} />);

    expect(html).toContain("Corridor source refresh needed");
    expect(html).toContain("No corridor estimate is shown until the source refresh succeeds.");
    expect(html).toContain("CONNECTOR NEEDED");
    expect(html).not.toContain("Order-of-magnitude estimate for this metro");
  });

  it("renders exactly three corridor plays and the Charlotte unnamed cricket fallback", () => {
    const sanJose = buildDossier("31000US41940");
    const charlotte = buildDossier("31000US16740");
    const html = renderToStaticMarkup(<PlaybookDossier dossier={charlotte} />);

    expect(sanJose.corridorPlays.map((play) => play.title)).toEqual([
      "Brand transition watch",
      "AI answer visibility content play",
      "National creator program",
    ]);
    expect(html).toContain("Unnamed cricket ground");
    expect(html).not.toMatch(/cricket \\d{6,}/u);
  });
});
