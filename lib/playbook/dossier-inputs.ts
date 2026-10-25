import anchorsArtifact from "@/data/artifacts/anchors.json";
import channelsArtifact from "@/data/artifacts/channels.json";
import cinemaArtifact from "@/data/artifacts/cinema.json";
import communityThreadsRaw from "@/data/artifacts/community-threads.json";
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
import type { Anchor } from "@/lib/data/anchors";
import type { Market } from "@/lib/data/markets";
import { buildDossierForMarket, type PlaybookDossierModel } from "@/lib/playbook/dossier";
import type { CommunityThreadsArtifact } from "@/components/signals/CommunityThreads";
import type { ChannelDefinition, PersonaDefinition } from "@/lib/scoring/personas";

const communityThreadsArtifact = communityThreadsRaw as unknown as CommunityThreadsArtifact;

const anchors = anchorsArtifact.data.anchors as unknown as Anchor[];
const channels = channelsArtifact.data.channels as unknown as ChannelDefinition[];
const markets = marketsArtifact.data.markets as unknown as Market[];
const personas = personasArtifact.data.personas as unknown as PersonaDefinition[];

export const playbookMarkets = markets;

export function isKnownMarketGeoid(geoid: string | undefined): geoid is string {
  return Boolean(geoid && markets.some((market) => market.geoid === geoid));
}

/**
 * Builds the same grounded dossier the Playbook page renders, for a single
 * market geoid. Returns null for unknown geoids so callers can degrade instead
 * of throwing. This is the single builder shared by the page (server render)
 * and the AI market-brief route (grounding), so both stay in lockstep.
 */
export function buildDossierForGeoid(
  geoid: string | undefined,
): PlaybookDossierModel | null {
  if (!isKnownMarketGeoid(geoid)) {
    return null;
  }

  return buildDossierForMarket({
    anchors,
    channels,
    cinemaSignals: cinemaArtifact.data.theaterSignals,
    communityThreads: communityThreadsArtifact.data.threads,
    competitorAds: competitorAdsArtifact.data.records,
    corridorContext: corridorContextArtifact.data,
    creators: creatorsArtifact.data.creators,
    fxHistory: fxHistoryArtifact.data,
    geoVisibility: geoVisibilityArtifact.data,
    marketGeoid: geoid,
    markets,
    monitorQueues: communityThreadsArtifact.data.monitorQueues,
    nationalAsianIndian: marketsArtifact.data.summary.nationalAsianIndian,
    personas,
    positioningProfiles: competitorPositioningArtifact.data.profiles,
    reviewThemes: reviewThemesArtifact.data.groups,
    seasonalMoments: seasonalCalendar.moments,
    sponsorExamples: creatorSponsorExamplesArtifact.data.examples,
    sponsorSignalsHref: creatorSponsorExamplesArtifact.data.signalsHref,
  });
}
