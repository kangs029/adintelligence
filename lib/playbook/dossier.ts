import type { Anchor } from "@/lib/data/anchors";
import { displayAnchorName } from "@/lib/data/anchor-display";
import type { Market } from "@/lib/data/markets";
import {
  rankChannelsForMarket,
  scorePersonaForMarket,
  type ChannelDefinition,
  type ChannelFit,
  type PersonaDefinition,
  type PersonaFit,
} from "@/lib/scoring/personas";
import {
  corridorContextForMarket,
  type CorridorContextData,
  type MarketCorridorContext,
} from "./corridor";
import { buildCounterMoveExperiment, type CounterMoveExperiment, type ReviewThemeGroup } from "./counter-moves";
import { creativeAnglesForPersonas, type CreativeAngleTemplate } from "./creative-angles";
import { howToForSurface, type SurfaceHowTo } from "./offline-howto";
import { nextSeasonalMoments, type SeasonalMoment } from "./seasonal";
import {
  buildCompetitorVisibility,
  buildGeoPack,
  buildPlatformRouting,
  buildTargetZones,
  type CompetitorVisibility,
  type GeoPack,
  type PlatformRouteRow,
  type TargetZone,
} from "./target-zones";
import { buildContentTopics, type ContentTopic } from "./content-topics";
import { composeWedgeLine } from "./wedge";

export type EvidenceLink = {
  href: string;
  label: string;
};

export type PlaybookPersona = PersonaFit & {
  name: string;
  messageAngles: string[];
  rawScore: number;
};

export type PlaybookChannel = ChannelFit & {
  benchmarkMarket: Market;
  evidenceLinks: EvidenceLink[];
  rawScore: number;
};

export type OfflineRecommendation = {
  evidenceLinks: EvidenceLink[];
  howTo: SurfaceHowTo;
  kind: Anchor["kind"];
  setup: string;
  title: string;
};

export type PlaybookExperiment = {
  budgetBand: string;
  channelName: string;
  doesNotProve: string;
  duration: string;
  hypothesis: string;
  killCriterion: string;
  personaName: string;
  primaryMetric: string;
  sourceLinks: EvidenceLink[];
  setup: string;
  successThreshold: string;
  tag?: "counter-move";
};

export type XpatNeed = {
  csvAlternative: string;
  decisionUnlocked: string;
  fields: string[];
  fieldsText: string;
  schema: string;
};

export type FxHistoryPoint = {
  date: string;
  rate: number;
};

export type FxHistoryData = {
  base: string;
  current: FxHistoryPoint;
  endDate: string;
  rates: FxHistoryPoint[];
  sourceUrl: string;
  startDate: string;
  target: string;
};

export type PlaybookDossierModel = {
  benchmarkMarket: Market;
  brandTransitionPlay: {
    body: string;
    evidenceLinks: EvidenceLink[];
    title: string;
  };
  channels: PlaybookChannel[];
  competitorVisibility: CompetitorVisibility;
  contentTopics: ContentTopic[];
  corridor: MarketCorridorContext;
  corridorPlays: Array<{
    body: string;
    evidenceLinks: EvidenceLink[];
    title: string;
  }>;
  creativeAngles: CreativeAngleTemplate[];
  experiments: PlaybookExperiment[];
  fxHistory: FxHistoryData | null;
  geoPack: GeoPack;
  market: Market;
  measurementSpec: {
    events: string[];
    schemaName: string;
    utmConvention: string;
  };
  marketsForProofGate: Market[];
  offlineSurfaces: {
    coverageNote: string | null;
    recommendations: OfflineRecommendation[];
  };
  personas: PlaybookPersona[];
  platformRouting: PlatformRouteRow[];
  referralPlay: {
    body: string;
    evidenceLinks: EvidenceLink[];
    measurementPath: string;
    title: string;
  };
  seasonalMoments: SeasonalMoment[];
  sponsorExamples: Array<{
    brand: string;
    capturedAt: string;
    creator: string;
    evidence: string;
    sourceUrl: string;
  }>;
  sponsorSignalsHref: string;
  targetZones: TargetZone[];
  wedgeLine: string;
  xpatNeeds: XpatNeed[];
};

interface BuildDossierInput {
  anchors: Anchor[];
  channels: ChannelDefinition[];
  cinemaSignals: Array<{
    joinedMarketRef?: { id?: string };
    language?: string;
    sourceUrl: string;
    theaterName: string;
  }>;
  competitorAds: Array<{
    bodyText?: string | null;
    capturedAt?: string | null;
    caveat?: string | null;
    competitor: string;
    headline?: string | null;
    platform: string;
    screenshotPath?: string | null;
    sourceUrl: string;
    status?: string | null;
  }>;
  communityThreads: Array<{
    action?: string;
    pain?: string;
    priority?: string;
    responseAngle?: string;
    themes?: string[];
    title: string;
    url: string;
  }>;
  corridorContext: CorridorContextData | null;
  creators: Array<{
    currentSponsor?: string | null;
    group?: string;
    handle: string;
    link: string;
  }>;
  fxHistory: FxHistoryData | null;
  geoVisibility: {
    cells?: Array<{
      query: string;
      status: string;
      xpatMentioned: boolean;
    }>;
    queries?: string[];
  };
  monitorQueues?: Array<{
    link: string;
    platform?: string;
    priority?: string;
    responseAngle?: string;
    title: string;
  }>;
  marketGeoid: string;
  markets: Market[];
  nationalAsianIndian: number;
  personas: PersonaDefinition[];
  positioningProfiles: Array<{
    competitor: string;
    headline: string;
    landingPageUrl: string;
  }>;
  reviewThemes: ReviewThemeGroup[];
  seasonalMoments: SeasonalMoment[];
  seasonalNow?: Date;
  sponsorExamples: PlaybookDossierModel["sponsorExamples"];
  sponsorSignalsHref: string;
}

const DEMO_BENCHMARKS: Record<string, string> = {
  "31000US19100": "31000US41940",
  "31000US19820": "31000US19100",
  "31000US26900": "31000US19820",
  "31000US41940": "31000US19100",
};

function formatKind(kind: Anchor["kind"]) {
  if (kind === "temple") return "Temple and community";
  if (kind === "grocery") return "Grocery retail";
  if (kind === "cricket") return "Cricket";
  return "Theater lobby";
}

function distanceMiles(left: Market, right: Market) {
  const radiusMiles = 3_958.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(dLng / 2) ** 2;

  return 2 * radiusMiles * Math.asin(Math.sqrt(a));
}

function recommendationConfidence(score: number, contributionCount: number): PersonaFit["confidence"] {
  if (score >= 75 && contributionCount >= 2) return "high";
  if (score >= 50 && contributionCount >= 2) return "medium";
  return "exploratory";
}

function benchmarkSortScore(subject: Market, candidate: Market) {
  const subjectTier = subject.tier ?? 4;
  const candidateTier = candidate.tier ?? 4;
  const tierPenalty = Math.max(0, candidateTier - subjectTier) * 10_000;
  const distancePenalty = distanceMiles(subject, candidate);
  const scoreDelta = Math.abs((subject.score ?? 0) - (candidate.score ?? 0)) * 12;
  const populationDelta =
    Math.abs(Math.log10(subject.population.asianIndian + 1) - Math.log10(candidate.population.asianIndian + 1)) *
    500;
  const concentrationDelta =
    Math.abs(subject.concentration.multipleOfUS - candidate.concentration.multipleOfUS) * 80;

  return tierPenalty + distancePenalty + scoreDelta + populationDelta + concentrationDelta;
}

export function selectBenchmarkMarket(subject: Market, markets: Market[]) {
  const curatedBenchmark = DEMO_BENCHMARKS[subject.geoid];
  const curated = curatedBenchmark
    ? markets.find((candidate) => candidate.geoid === curatedBenchmark)
    : undefined;

  if (curated && curated.geoid !== subject.geoid) {
    return curated;
  }

  const subjectTier = subject.tier ?? 4;
  const sameOrHigherTier = markets.filter(
    (candidate) => candidate.geoid !== subject.geoid && (candidate.tier ?? 4) <= subjectTier,
  );
  const candidates = sameOrHigherTier.length > 0
    ? sameOrHigherTier
    : markets.filter((candidate) => candidate.geoid !== subject.geoid);

  const benchmark = candidates.sort((left, right) => {
    return benchmarkSortScore(subject, left) - benchmarkSortScore(subject, right);
  })[0];

  if (!benchmark) {
    throw new Error(`No benchmark market available for ${subject.geoid}`);
  }

  return benchmark;
}

function channelEvidenceLinks(
  channel: ChannelFit,
  sponsorExamples: PlaybookDossierModel["sponsorExamples"],
): EvidenceLink[] {
  if (channel.id === "google-search") {
    return [{ href: "/signals", label: "Search demand connector" }];
  }
  if (channel.id === "youtube-creators") {
    return [{ href: "/signals", label: "Creator signal artifact" }];
  }
  if (channel.id === "creator-sponsorship") {
    const exampleLinks = sponsorExamples.slice(0, 2).map((example) => ({
      href: example.sourceUrl,
      label: `${example.brand} sponsor example`,
    }));

    return [
      { href: "/signals#creators", label: "Signals creator evidence" },
      ...exampleLinks,
    ];
  }
  if (channel.id === "meta") {
    return [{ href: "/competitors", label: "Public creative evidence" }];
  }
  if (channel.id === "theater-lobby") {
    return [{ href: "/sources", label: "Cinema footprint snapshot" }];
  }

  return [{ href: "/", label: "Market community-place evidence" }];
}

function offlineSetup(anchor: Anchor) {
  if (anchor.kind === "grocery") {
    return "Community presence evidence only. Test a QR comparison card near the named grocery surface.";
  }
  if (anchor.kind === "temple") {
    return "Community presence evidence only. Test a sponsorship handout with transparent quote comparison.";
  }
  if (anchor.kind === "cricket") {
    return "Community presence evidence only. Test a match-day QR card with clear support expectations.";
  }
  return "Cinema release-window evidence only. Test a lobby QR card during relevant Indian-language releases.";
}

function evidenceLabelForAnchor(anchor: Anchor) {
  return anchor.qaFlags?.includes("cinema-signal") ? "Cinema release-window source" : "OSM source";
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function cinemaMarketIds(market: Market) {
  const legacyAliases: Record<string, string[]> = {
    "31000US19430": ["dayton-beavercreek-oh"],
    "31000US19740": ["denver-aurora-co"],
    "31000US26900": ["indianapolis-greenwood-in"],
    "31000US33460": ["minneapolis-plymouth-mn"],
    "31000US35300": ["new-haven-stamford-ct"],
    "31000US41180": ["st-louis-saint-louis-mo"],
    "31000US45300": ["tampa-clearwater-fl"],
  };
  const states = market.states.length ? market.states : [market.state];
  const nameParts = market.name.split("-").map(slugPart).filter(Boolean);
  const ids = new Set<string>([market.geoid]);

  for (const state of states) {
    const stateSlug = slugPart(state);
    if (!stateSlug) continue;
    ids.add(`${slugPart(market.name)}-${stateSlug}`);
    if (nameParts.length > 1) {
      ids.add(`${nameParts[0]}-${nameParts.at(-1)}-${stateSlug}`);
      ids.add(`${nameParts[0]}-${nameParts[1]}-${stateSlug}`);
    }
  }
  for (const alias of legacyAliases[market.geoid] ?? []) ids.add(alias);

  return ids;
}

function cinemaSignalMatchesMarket(
  signal: BuildDossierInput["cinemaSignals"][number],
  marketIds: Set<string>,
) {
  const id = signal.joinedMarketRef?.id;
  return Boolean(id && marketIds.has(id));
}

function offlineRecommendations({
  anchors,
  cinemaSignals,
  market,
}: {
  anchors: Anchor[];
  cinemaSignals: BuildDossierInput["cinemaSignals"];
  market: Market;
}) {
  const byKind = new Map<Anchor["kind"], Anchor>();
  for (const anchor of anchors) {
    if (!byKind.has(anchor.kind)) byKind.set(anchor.kind, anchor);
  }

  const marketIds = cinemaMarketIds(market);
  const hasCinemaSignal = cinemaSignals.some((signal) => cinemaSignalMatchesMarket(signal, marketIds));
  if (hasCinemaSignal && !byKind.has("theater")) {
    const signal = cinemaSignals.find((candidate) => cinemaSignalMatchesMarket(candidate, marketIds));
    if (signal) {
      byKind.set("theater", {
        id: `cinema-signal-${market.geoid}`,
        kind: "theater",
        lat: 0,
        lng: 0,
        marketGeoid: market.geoid,
        name: signal.theaterName,
        osmUrl: signal.sourceUrl,
        qaFlags: ["cinema-signal"],
        tags: {},
      });
    }
  }

  return [...byKind.values()].slice(0, 4).map((anchor) => ({
    evidenceLinks: [{ href: anchor.osmUrl, label: evidenceLabelForAnchor(anchor) }],
    howTo: howToForSurface(anchor.kind),
    kind: anchor.kind,
    setup: offlineSetup(anchor),
    title: `${formatKind(anchor.kind)} test at ${displayAnchorName(anchor)}`,
  }));
}

function buildExperiments({
  benchmarkMarket,
  channels,
  market,
  personas,
}: {
  benchmarkMarket: Market;
  channels: PlaybookChannel[];
  market: Market;
  personas: PlaybookPersona[];
}) {
  return channels.slice(0, 3).map((channel, index) => {
    const persona = personas[index % personas.length];

    return {
      budgetBand: channel.suggestedTestBudgetEstimate,
      channelName: channel.name,
      doesNotProve:
        "Does not prove downstream acquisition economics until Xpat owned exports are joined.",
      duration: "Two-week test window.",
      hypothesis: `Hypothesis to test: ${persona.name} may respond to ${channel.name} in ${market.name}.`,
      killCriterion:
        "Pause after 14 days below the agreed stop line; keep the learning, then rework the angle before widening the test.",
      personaName: persona.name,
      primaryMetric: channel.successMetric,
      sourceLinks: channel.evidenceLinks,
      setup: `Use ${channel.name} with cited evidence. Compare against ${benchmarkMarket.name} before kickoff.`,
      successThreshold:
        `Threshold set with Xpat at kickoff: define numeric continue, change, and stop lines for ${channel.successMetric.toLowerCase()} before launch.`,
    };
  });
}

function counterMoveToExperiment(counterMove: CounterMoveExperiment): PlaybookExperiment {
  return {
    budgetBand: "Suggested test budget, estimate: use the selected channel band.",
    channelName: counterMove.channelName,
    doesNotProve:
      "Does not prove downstream acquisition economics until Xpat owned exports are joined.",
    duration: "Two-week test window.",
    hypothesis: counterMove.hypothesis,
    killCriterion: counterMove.killCriterion,
    personaName: "Competitor-switcher",
    primaryMetric: "Observable comparison engagement from the selected counter-message.",
    setup: counterMove.observedWeakness,
    sourceLinks: counterMove.sourceLinks,
    successThreshold: counterMove.successThreshold,
    tag: "counter-move",
  };
}

function xpatNeeds(): XpatNeed[] {
  const csvAlternative = "No API access needed to start, one exported CSV is enough.";
  const exportNeed = ({
    decisionUnlocked,
    fields,
    schema,
  }: {
    decisionUnlocked: string;
    fields: string[];
    schema: string;
  }): XpatNeed => ({
    csvAlternative,
    decisionUnlocked,
    fields,
    fieldsText: `Connector-needed export schema fields: ${fields.join("; ")}.`,
    schema,
  });

  return [
    exportNeed({
      decisionUnlocked:
        "Shows whether high-evidence markets are already covered or a confirmed gap.",
      fields: [
        "market_geoid",
        "geo_name",
        "state",
        "spend",
        "conversions",
        "first_transfers",
        "clicks",
        "impressions",
        "platform",
        "campaign",
        "baseline_group",
        "term_or_audience",
      ],
      schema: "Google Ads export",
    }),
    exportNeed({
      decisionUnlocked:
        "Shows whether high-evidence regions are already covered or a confirmed gap.",
      fields: [
        "market_geoid",
        "geo_name",
        "state",
        "spend",
        "conversions",
        "first_transfers",
        "clicks",
        "impressions",
        "platform",
        "campaign",
        "baseline_group",
        "audience",
      ],
      schema: "Meta export",
    }),
    exportNeed({
      decisionUnlocked: "Joins install source to first-transfer outcomes.",
      fields: [
        "install_id",
        "source",
        "campaign",
        "event",
        "event_timestamp",
        "market_geoid",
        "device",
        "first_transfer_outcome",
      ],
      schema: "ASA and MMP export",
    }),
    exportNeed({
      decisionUnlocked:
        "Locates where onboarding friction concentrates by market and channel using Xpat-owned funnel events.",
      fields: [
        "anonymous_user_id",
        "market_geoid",
        "source_tag",
        "channel",
        "KYC start",
        "KYC drop-off step",
        "quote-page event",
        "timestamp",
      ],
      schema: "Funnel events export",
    }),
    exportNeed({
      decisionUnlocked:
        "Shows which competitors bid against Xpat in each target zone.",
      fields: [
        "date",
        "campaign",
        "target_zone",
        "geo",
        "competitor_domain",
        "impression_share",
        "overlap_rate",
        "position_above_rate",
      ],
      schema: "Google Ads Auction Insights by geo",
    }),
  ];
}

function brandTransitionPlay(positioningProfiles: BuildDossierInput["positioningProfiles"]) {
  const xpat = positioningProfiles.find((profile) => profile.competitor === "Xpat");

  return {
    body:
      "The rebrand splits brand equity across two names. Light branded-search coverage on the old name protects existing demand while the new name builds.",
    evidenceLinks: [
      {
        href: xpat?.landingPageUrl ?? "https://xpat.money/",
        label: xpat?.headline ?? "Xpat positioning snapshot",
      },
    ],
    title: "Brand transition watch",
  };
}

function aiAnswerVisibilityPlay(geoVisibility: BuildDossierInput["geoVisibility"]) {
  const capturedAbsentQueries = [
    ...new Set(
      (geoVisibility.cells ?? [])
        .filter((cell) => cell.status === "captured" && !cell.xpatMentioned)
        .map((cell) => cell.query),
    ),
  ];
  const pendingQueries = geoVisibility.queries ?? [];
  const queryText = (capturedAbsentQueries.length ? capturedAbsentQueries : pendingQueries)
    .slice(0, 3)
    .join(", ");

  return {
    body: capturedAbsentQueries.length
      ? `Publish comparison and rate-transparency content targeting the corridor queries where Xpat is absent from AI answers: ${queryText}.`
      : `Geo-visibility capture is pending. Once dated captures show Xpat absent, publish comparison and rate-transparency content targeting those corridor queries: ${queryText}.`,
    evidenceLinks: [{ href: "/signals#geo-visibility", label: "AI answer visibility artifact" }],
    title: "AI answer visibility content play",
  };
}

function nationalCreatorProgramPlay(creators: BuildDossierInput["creators"], sponsorSignalsHref: string) {
  const sponsored = creators.filter((creator) => creator.group === "evidence-linked" && creator.currentSponsor);
  const examples = sponsored.slice(0, 2).map((creator) => `${creator.currentSponsor} via ${creator.handle}`);

  return {
    body: examples.length
      ? `Run a national creator program from the evidence-linked roster. Observed sponsor surfaces prove the channel exists: ${examples.join(", ")}. They do not prove campaign results.`
      : "Run a national creator program from the evidence-linked roster. Observed sponsor surfaces prove the channel exists when dated examples are present. They do not prove campaign results.",
    evidenceLinks: [{ href: sponsorSignalsHref, label: "Creator roster and sponsor examples" }],
    title: "National creator program",
  };
}

function corridorPlays({
  brand,
  creators,
  geoVisibility,
  sponsorSignalsHref,
}: {
  brand: PlaybookDossierModel["brandTransitionPlay"];
  creators: BuildDossierInput["creators"];
  geoVisibility: BuildDossierInput["geoVisibility"];
  sponsorSignalsHref: string;
}) {
  return [
    brand,
    aiAnswerVisibilityPlay(geoVisibility),
    nationalCreatorProgramPlay(creators, sponsorSignalsHref),
  ];
}

function referralPlay(recommendations: OfflineRecommendation[], sponsorSignalsHref: string) {
  const hasMarketSurfaces = recommendations.length > 0;
  const marketEvidenceLinks: EvidenceLink[] = hasMarketSurfaces
    ? recommendations.slice(0, 2).flatMap((recommendation) => recommendation.evidenceLinks)
    : [];

  return {
    body: hasMarketSurfaces
      ? "Referral amplification: These cited community and creator surfaces are testable referral-code placements. Xpat-owned source tags are needed before drawing any referral-channel conclusion."
      : "Referral amplification: no audited local referral surface is available for this market yet. Xpat-owned source tags are needed before drawing any referral-channel conclusion.",
    evidenceLinks: [...marketEvidenceLinks, { href: sponsorSignalsHref, label: "Creator promo-code seeds" }],
    measurementPath: "Referral-code source tags and Xpat-owned export schema.",
    title: "Referral amplification",
  };
}

function compactMarkets(markets: Market[]) {
  return markets.map((market) => ({
    concentration: market.concentration,
    geoid: market.geoid,
    lat: market.lat,
    lng: market.lng,
    moeReliability: market.moeReliability,
    name: market.name,
    population: market.population,
    score: market.score,
    state: market.state,
    states: market.states,
    tier: market.tier,
  })) as Market[];
}

export function buildDossierForMarket({
  anchors,
  channels,
  cinemaSignals,
  competitorAds,
  communityThreads,
  corridorContext,
  creators,
  fxHistory,
  geoVisibility,
  marketGeoid,
  markets,
  monitorQueues,
  nationalAsianIndian,
  personas,
  positioningProfiles,
  reviewThemes,
  seasonalMoments,
  seasonalNow,
  sponsorExamples,
  sponsorSignalsHref,
}: BuildDossierInput): PlaybookDossierModel {
  const market = markets.find((candidate) => candidate.geoid === marketGeoid);
  if (!market) {
    throw new Error(`Unknown market geoid ${marketGeoid}`);
  }

  const marketAnchors = anchors.filter((anchor) => anchor.marketGeoid === market.geoid);
  const benchmarkMarket = selectBenchmarkMarket(market, markets);
  const personaFits = personas
    .map((persona) => ({
      ...scorePersonaForMarket(market, persona),
      messageAngles: persona.messageAngles,
      name: persona.name,
    }))
    .sort((left, right) => right.score - left.score)
    .map((persona) => {
      return {
        ...persona,
        confidence: recommendationConfidence(persona.score, persona.contributions.length),
        rawScore: persona.score,
      };
    })
    .slice(0, 4);
  const channelFits = rankChannelsForMarket(market, channels)
    .map((channel) => ({
      ...channel,
      benchmarkMarket,
      evidenceLinks: channelEvidenceLinks(channel, sponsorExamples),
      rawScore: channel.score,
    }))
    .slice(0, 6);
  const recommendations = offlineRecommendations({
    anchors: marketAnchors,
    cinemaSignals,
    market,
  });
  const targetZones = buildTargetZones({
    anchors,
    market,
  });
  const baseExperiments = buildExperiments({
    benchmarkMarket,
    channels: channelFits,
    market,
    personas: personaFits,
  });
  const counterMove = buildCounterMoveExperiment({ channels: channelFits, reviewThemes });
  const experiments = counterMove
    ? [...baseExperiments, counterMoveToExperiment(counterMove)]
    : baseExperiments;
  const brand = brandTransitionPlay(positioningProfiles);

  return {
    benchmarkMarket,
    brandTransitionPlay: brand,
    channels: channelFits,
    competitorVisibility: buildCompetitorVisibility(competitorAds),
    contentTopics: buildContentTopics({
      channels: channelFits,
      communityThreads,
      market,
      monitorQueues,
      personas: personaFits,
      reviewThemes,
      sponsorExamples,
      targetZones,
    }),
    corridor: corridorContextForMarket({
      context: corridorContext,
      market,
      nationalAsianIndian,
    }),
    corridorPlays: corridorPlays({
      brand,
      creators,
      geoVisibility,
      sponsorSignalsHref,
    }),
    creativeAngles: creativeAnglesForPersonas(personaFits),
    experiments,
    fxHistory,
    geoPack: buildGeoPack({
      market,
      theaterSignals: cinemaSignals,
      zones: targetZones,
    }),
    market,
    measurementSpec: {
      events: [
        "Connector-needed schema field: install",
        "Connector-needed schema field: signup",
        "Connector-needed schema field: KYC start",
        "Connector-needed schema field: KYC completion",
        "Connector-needed schema field: first transfer",
        "Connector-needed schema field: repeat transfer",
      ],
      schemaName: "Connector-needed Xpat event export schema",
      utmConvention: "utm_source, utm_medium, utm_campaign, utm_market, utm_persona",
    },
    marketsForProofGate: compactMarkets(markets),
    offlineSurfaces: {
      coverageNote:
        recommendations.length === 0
          ? "No offline-surface recommendation is inferred because this market has no audited temple, grocery, cricket, or theater rows yet."
          : null,
      recommendations,
    },
    personas: personaFits,
    platformRouting: buildPlatformRouting({
      channels: channelFits,
      personas: personaFits,
    }),
    referralPlay: referralPlay(recommendations, sponsorSignalsHref),
    seasonalMoments: nextSeasonalMoments(seasonalMoments, seasonalNow),
    sponsorExamples,
    sponsorSignalsHref,
    targetZones,
    wedgeLine: composeWedgeLine(market, reviewThemes),
    xpatNeeds: xpatNeeds(),
  };
}
