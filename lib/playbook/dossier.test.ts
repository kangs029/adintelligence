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
import { validateClaims } from "@/lib/claims/contract";
import { buildDossierForMarket, selectBenchmarkMarket } from "./dossier";

const demoGeoids = ["31000US41940", "31000US19100", "31000US19820", "31000US26900"];

function buildDossier(geoid: string) {
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

describe("buildDossierForMarket", () => {
  it.each(demoGeoids)("builds a claim-clean dossier for %s", (geoid) => {
    const dossier = buildDossier(geoid);

    expect(dossier.market.geoid).toBe(geoid);
    expect(dossier.personas).toHaveLength(4);
    expect(dossier.channels.length).toBeGreaterThanOrEqual(4);
    expect(dossier.targetZones.length).toBeLessThanOrEqual(8);
    expect(dossier.platformRouting).toHaveLength(dossier.personas.length);
    expect(dossier.experiments.length).toBeGreaterThanOrEqual(1);
    expect(dossier.experiments.length).toBeLessThanOrEqual(4);
    expect(dossier.measurementSpec.schemaName).toBe("Connector-needed Xpat event export schema");
    expect(validateClaims(dossier, "dossier")).toEqual([]);
  });

  it("shows confidence and at least two why contributions for every persona card", () => {
    const dossier = buildDossier("31000US41940");

    expect(
      dossier.personas.every(
        (persona) => persona.confidence && persona.contributions.length >= 2,
      ),
    ).toBe(true);
  });

  it.each(demoGeoids)("keeps display scores bounded and inspectable for %s", (geoid) => {
    const dossier = buildDossier(geoid);
    const personaScores = dossier.personas.map((persona) => persona.score);
    const channelScores = dossier.channels.map((channel) => channel.score);

    expect([...personaScores, ...channelScores].every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(dossier.personas.every((persona) => persona.contributions.length >= 2)).toBe(true);
    expect(dossier.channels.every((channel) => channel.contributions.length >= 2)).toBe(true);
  });

  it.each(demoGeoids)("keeps visible score components summing to displayed scores for %s", (geoid) => {
    const dossier = buildDossier(geoid);
    const scoreFromComponents = (contributions: Array<{ weightedPoints: number }>) =>
      Math.round(contributions.reduce((sum, contribution) => sum + contribution.weightedPoints, 0));

    for (const persona of dossier.personas) {
      expect(scoreFromComponents(persona.contributions)).toBe(Math.round(persona.score));
    }

    for (const channel of dossier.channels) {
      expect(scoreFromComponents(channel.contributions)).toBe(Math.round(channel.score));
    }
  });

  it.each(demoGeoids)("selects a benchmark market that is not the subject market for %s", (geoid) => {
    const subject = marketsArtifact.data.markets.find((market) => market.geoid === geoid);
    if (!subject) throw new Error(`Missing demo market ${geoid}`);
    const benchmark = selectBenchmarkMarket(subject, marketsArtifact.data.markets);
    const dossier = buildDossier(geoid);

    expect(benchmark.geoid).not.toBe(subject.geoid);
    expect(dossier.benchmarkMarket.geoid).toBe(benchmark.geoid);
    expect(dossier.channels.every((channel) => channel.benchmarkMarket.geoid !== geoid)).toBe(true);
  });

  it("gives every experiment a concrete or kickoff-owned threshold", () => {
    const dossier = buildDossier("31000US41940");

    expect(
      dossier.experiments.every(
        (experiment) =>
          /\d/.test(experiment.successThreshold) ||
          experiment.successThreshold.includes("Threshold set with Xpat at kickoff"),
      ),
    ).toBe(true);
    expect(
      dossier.experiments.every(
        (experiment) =>
          /\d/.test(experiment.killCriterion) ||
          experiment.killCriterion.includes("agreed stop line"),
      ),
    ).toBe(true);
    expect(dossier.experiments.every((experiment) => experiment.primaryMetric.length > 0)).toBe(true);
    expect(
      dossier.experiments.every((experiment) =>
        experiment.doesNotProve.includes("Does not prove downstream acquisition economics"),
      ),
    ).toBe(true);
  });

  it.each(["31000US41940", "31000US19100", "31000US16740"])(
    "has no blank Playbook labels or values for %s",
    (geoid) => {
      const dossier = buildDossier(geoid);
      const strings = [
        ...dossier.channels.flatMap((channel) => [
          channel.name,
          channel.suggestedTestBudgetEstimate,
          channel.successMetric,
        ]),
        ...dossier.experiments.flatMap((experiment) => [
          experiment.budgetBand,
          experiment.killCriterion,
          experiment.primaryMetric,
          experiment.successThreshold,
        ]),
        ...dossier.contentTopics.flatMap((topic) => [
          topic.copyReadyAsset,
          topic.nextExperiment,
          topic.ownerChannel,
          topic.replyAngle,
          topic.sourceEvidence,
          topic.topic,
        ]),
      ];

      expect(strings.every((value) => value.trim().length > 0)).toBe(true);
      expect(strings.join("\n")).not.toMatch(/undefined|null|Suggested test budget, estimate:\s*$/u);
    },
  );

  it("keeps Xpat-owned schemas explicit and connector-needed", () => {
    const dossier = buildDossier("31000US41940");

    expect(dossier.xpatNeeds).toHaveLength(5);
    expect(dossier.xpatNeeds.every((need) => need.fieldsText.includes("Connector-needed export schema"))).toBe(true);
    expect(dossier.xpatNeeds.every((need) => need.fields.length >= 7)).toBe(true);
    expect(dossier.xpatNeeds[0].fields).toContain("term_or_audience");
    expect(dossier.xpatNeeds[4]?.schema).toBe("Google Ads Auction Insights by geo");
    expect(dossier.xpatNeeds[4]?.decisionUnlocked).toBe(
      "Shows which competitors bid against Xpat in each target zone.",
    );
  });

  it.each(["31000US41940", "31000US19100", "31000US19820"])(
    "adds a counter-move experiment with a real review share for %s",
    (geoid) => {
      const dossier = buildDossier(geoid);
      const counter = dossier.experiments.find((experiment) => experiment.tag === "counter-move");

      expect(counter).toBeTruthy();
      expect(counter?.setup).toMatch(/\d+\.\d%/u);
      expect(counter?.sourceLinks[0]?.href).toBe("/competitors#review-themes-title");
    },
  );

  it("adds creator sponsorship to the ranked plan for San Jose", () => {
    const dossier = buildDossier("31000US41940");
    const creatorSponsorship = dossier.channels.find((channel) => channel.id === "creator-sponsorship");

    expect(dossier.channels.some((channel) => channel.id === "creator-sponsorship")).toBe(true);
    expect(creatorSponsorship?.evidenceLinks.some((link) => link.href.includes("youtube.com/watch"))).toBe(true);
    expect(dossier.sponsorExamples.map((example) => example.brand)).toContain("Aspora");
    expect(validateClaims(dossier.channels, "dossier")).toEqual([]);
  });

  it("renders corridor, creative, brand, referral, and seasonal content from artifacts", () => {
    const dossier = buildDossier("31000US41940");

    expect(dossier.wedgeLine).toContain("national Asian Indian concentration");
    expect(dossier.corridor.estimateLabel).toMatch(/^\$\d+\.\dB a year$/u);
    expect(dossier.brandTransitionPlay.body).toContain("The rebrand splits brand equity");
    expect(dossier.corridorPlays).toHaveLength(3);
    expect(dossier.corridorPlays.map((play) => play.title)).toEqual([
      "Brand transition watch",
      "AI answer visibility content play",
      "National creator program",
    ]);
    expect(dossier.referralPlay.body).toContain("Referral amplification");
    expect(dossier.referralPlay.body).not.toMatch(/proven channel|highest-probability/u);
    expect(dossier.creativeAngles.length).toBeGreaterThanOrEqual(1);
    expect(dossier.creativeAngles.length).toBeLessThanOrEqual(4);
    expect(dossier.creativeAngles.every((angle) => angle.groundingSignal.href)).toBe(true);
    expect(dossier.seasonalMoments).toHaveLength(3);
  });

  it("builds content topics, target zones, geo packs, platform routing, and competitor visibility", () => {
    const dossier = buildDossier("31000US41940");

    expect(dossier.contentTopics.length).toBeGreaterThanOrEqual(3);
    expect(dossier.contentTopics.map((topic) => topic.topic)).toContain("Sunnyvale community setup card");
    expect(dossier.contentTopics.every((topic) => topic.sourceLinks.length >= 1)).toBe(true);
    expect(validateClaims(dossier.contentTopics, "dossier")).toEqual([]);
    expect(dossier.targetZones.length).toBeGreaterThan(0);
    expect(dossier.targetZones.map((zone) => zone.locality)).not.toContain("Livingston");
    expect(dossier.targetZones.every((zone) => zone.evidenceLinks.length >= 1)).toBe(true);
    expect(dossier.geoPack.text).toContain("Google Ads location targets");
    expect(dossier.geoPack.text).toContain("Meta setup note: per the team's reported constraint");
    expect(dossier.platformRouting[0]?.cells).toHaveLength(4);
    expect(dossier.competitorVisibility.framing).toContain("data ask #5");
    expect(validateClaims(dossier.targetZones, "dossier")).toEqual([]);
    expect(validateClaims(dossier.geoPack, "dossier")).toEqual([]);
    expect(validateClaims(dossier.platformRouting, "dossier")).toEqual([]);
    expect(validateClaims(dossier.competitorVisibility, "dossier")).toEqual([]);
  });

  it("requires evidence links for every channel and offline recommendation", () => {
    const dossier = buildDossier("31000US19100");

    expect(dossier.channels.every((channel) => channel.evidenceLinks.length >= 1)).toBe(true);
    expect(dossier.offlineSurfaces.recommendations.length).toBeGreaterThan(0);
    expect(
      dossier.offlineSurfaces.recommendations.every(
        (recommendation) => recommendation.evidenceLinks.length >= 1,
      ),
    ).toBe(true);
  });

  it("uses a coverage note instead of invented offline surfaces when anchors are absent", () => {
    const dossier = buildDossier("31000US36260");

    expect(dossier.offlineSurfaces.recommendations.some((recommendation) => recommendation.kind !== "theater")).toBe(false);
  });

  it("does not invent referral market evidence when local surfaces are empty", () => {
    const dossier = buildDossier("31000US36260");

    expect(dossier.offlineSurfaces.recommendations).toHaveLength(0);
    expect(dossier.referralPlay.body).toContain("no audited local referral surface");
    expect(dossier.referralPlay.evidenceLinks.map((link) => link.label)).not.toContain("Market community-place evidence");
  });

  it("maps legacy cinema candidate ids to playbook GEOIDs", () => {
    const dossier = buildDossier("31000US26900");
    const theater = dossier.offlineSurfaces.recommendations.find((recommendation) => recommendation.kind === "theater");

    expect(theater?.title).toContain("Emagine Noblesville");
    expect(theater?.evidenceLinks[0]?.label).toBe("Cinema release-window source");
  });

  it("preserves other known legacy cinema aliases", () => {
    const denver = buildDossier("31000US19740");
    const minneapolis = buildDossier("31000US33460");

    expect(denver.offlineSurfaces.recommendations.some((recommendation) => recommendation.kind === "theater")).toBe(true);
    expect(minneapolis.offlineSurfaces.recommendations.some((recommendation) => recommendation.kind === "theater")).toBe(true);
  });

  it("labels cinema-signal theater evidence without calling it OSM", () => {
    const dossier = buildDossier("31000US14460");
    const theater = dossier.offlineSurfaces.recommendations.find((recommendation) => recommendation.kind === "theater");

    expect(theater?.evidenceLinks[0]).toEqual(
      expect.objectContaining({
        label: "Cinema release-window source",
      }),
    );
  });
});
