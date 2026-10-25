import type { Anchor } from "@/lib/data/anchors";
import { displayAnchorName } from "@/lib/data/anchor-display";
import type { Market } from "@/lib/data/markets";
import type { ChannelFit, PersonaFit } from "@/lib/scoring/personas";

export type AnchorMix = {
  cricket: number;
  groceries: number;
  temples: number;
  theaters: number;
};

export type TargetZone = {
  anchorCount: number;
  assignedUntaggedCount: number;
  evidenceLinks: Array<{ href: string; label: string }>;
  id: string;
  locality: string;
  mix: AnchorMix;
  personaEvidence: string;
  score: number;
};

export type GeoPack = {
  text: string;
  previewLines: string[];
};

export type PlatformFit = "strong" | "possible" | "weak";

export type PlatformRouteCell = {
  fit: PlatformFit;
  platform: "Google Search" | "Meta" | "YouTube/creator" | "Apple Search Ads";
  why: string;
};

export type PlatformRouteRow = {
  cells: PlatformRouteCell[];
  personaName: string;
};

export type CompetitorVisibility = {
  capturedAt: string | null;
  framing: string;
  records: Array<{
    competitor: string;
    headline: string;
    platform: string;
    sourceUrl: string;
    status: string;
  }>;
  state: "captured" | "no-capture" | "connector-needed";
};

type CompetitorAdRecord = {
  bodyText?: string | null;
  capturedAt?: string | null;
  caveat?: string | null;
  competitor: string;
  headline?: string | null;
  platform: string;
  screenshotPath?: string | null;
  sourceUrl: string;
  status?: string | null;
};

type TheaterSignal = {
  joinedMarketRef?: { id?: string };
  language?: string;
};

const emptyMix: AnchorMix = {
  cricket: 0,
  groceries: 0,
  temples: 0,
  theaters: 0,
};

function compact(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeCity(value: string) {
  return compact(value).toLowerCase();
}

function cityForAnchor(anchor: Anchor) {
  const city = anchor.tags["addr:city"] ?? anchor.tags.city;
  if (!city) return null;
  const clean = compact(city);
  return clean.length > 0 ? clean : null;
}

function stateForAnchor(anchor: Anchor) {
  const state = anchor.tags["addr:state"] ?? anchor.tags.state;
  return state ? compact(state).toUpperCase() : null;
}

function marketLocalityTokens(market: Market) {
  return new Set(
    market.name
      .split(/[-,]/u)
      .map((part) => normalizeCity(part))
      .filter(Boolean),
  );
}

function hasActionableLocalityEvidence({
  anchors,
  locality,
  market,
}: {
  anchors: Anchor[];
  locality: string;
  market: Market;
}) {
  const allowedStates = new Set((market.states.length ? market.states : [market.state]).map((state) => state.toUpperCase()));
  const hasStateMatch = anchors.some((anchor) => {
    const state = stateForAnchor(anchor);
    return state ? allowedStates.has(state) : false;
  });

  if (hasStateMatch) return true;

  return marketLocalityTokens(market).has(normalizeCity(locality));
}

function distanceMiles(left: { lat: number; lng: number }, right: { lat: number; lng: number }) {
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

function centroid(anchors: Anchor[]) {
  const usable = anchors.filter((anchor) => Number.isFinite(anchor.lat) && Number.isFinite(anchor.lng));
  const count = usable.length || 1;

  return {
    lat: usable.reduce((sum, anchor) => sum + anchor.lat, 0) / count,
    lng: usable.reduce((sum, anchor) => sum + anchor.lng, 0) / count,
  };
}

function nearestNamedGroup(anchor: Anchor, groups: Map<string, { anchors: Anchor[]; locality: string }>) {
  let best: { key: string; miles: number } | null = null;

  for (const [key, group] of groups) {
    const miles = distanceMiles(anchor, centroid(group.anchors));
    if (!best || miles < best.miles) {
      best = { key, miles };
    }
  }

  return best?.key ?? null;
}

function mixForAnchors(anchors: Anchor[]): AnchorMix {
  const mix = { ...emptyMix };

  for (const anchor of anchors) {
    if (anchor.kind === "temple") mix.temples += 1;
    if (anchor.kind === "grocery") mix.groceries += 1;
    if (anchor.kind === "cricket") mix.cricket += 1;
    if (anchor.kind === "theater") mix.theaters += 1;
  }

  return mix;
}

function diversity(mix: AnchorMix) {
  return [mix.temples, mix.groceries, mix.cricket, mix.theaters].filter((count) => count > 0).length;
}

function zoneScore(mix: AnchorMix) {
  const count = mix.temples + mix.groceries + mix.cricket + mix.theaters;

  return Math.round(count * (1 + Math.max(0, diversity(mix) - 1) * 0.25) * 100) / 100;
}

function sentenceList(values: string[]) {
  const unique = [...new Set(values)];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0]!;

  return `${unique.slice(0, -1).join(", ")} and ${unique.at(-1)}`;
}

export function personaEvidenceForMix(mix: AnchorMix) {
  const personas: string[] = [];
  if (mix.groceries > 0 || mix.temples > 0) personas.push("family remitter");
  if (mix.cricket > 0) personas.push("H1B mid-career professional");
  if (mix.theaters > 0) personas.push("regional-language family remitter");

  if (personas.length === 0) {
    return "Community presence evidence only. Persona fit remains market-level.";
  }

  return `Evidence for the ${sentenceList(personas)} personas. These places are community presence evidence, not customer counts.`;
}

function nearestEvidenceLinks(anchors: Anchor[]) {
  const center = centroid(anchors);

  return anchors
    .toSorted((left, right) => distanceMiles(left, center) - distanceMiles(right, center))
    .slice(0, 3)
    .map((anchor) => ({
      href: anchor.osmUrl,
      label: displayAnchorName(anchor),
    }));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

export function buildTargetZones({
  anchors,
  market,
  maxZones = 8,
}: {
  anchors: Anchor[];
  market: Market;
  maxZones?: number;
}): TargetZone[] {
  const marketAnchors = anchors.filter((anchor) => anchor.marketGeoid === market.geoid);
  const groups = new Map<string, { anchors: Anchor[]; locality: string; untagged: number }>();
  const untagged: Anchor[] = [];

  for (const anchor of marketAnchors) {
    const city = cityForAnchor(anchor);
    if (!city) {
      untagged.push(anchor);
      continue;
    }

    const key = normalizeCity(city);
    const group = groups.get(key) ?? { anchors: [], locality: city, untagged: 0 };
    group.anchors.push(anchor);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    if (!hasActionableLocalityEvidence({ anchors: group.anchors, locality: group.locality, market })) {
      groups.delete(key);
    }
  }

  for (const anchor of untagged) {
    const nearestKey = nearestNamedGroup(anchor, groups);
    if (!nearestKey) continue;
    const group = groups.get(nearestKey);
    if (!group) continue;
    group.anchors.push(anchor);
    group.untagged += 1;
  }

  return [...groups.values()]
    .map((group) => {
      const mix = mixForAnchors(group.anchors);

      return {
        anchorCount: group.anchors.length,
        assignedUntaggedCount: group.untagged,
        evidenceLinks: nearestEvidenceLinks(group.anchors),
        id: `${market.geoid}-${slug(group.locality)}`,
        locality: group.locality,
        mix,
        personaEvidence: personaEvidenceForMix(mix),
        score: zoneScore(mix),
      };
    })
    .filter((zone) => zone.anchorCount > 0)
    .toSorted((left, right) => right.score - left.score || left.locality.localeCompare(right.locality))
    .slice(0, maxZones);
}

function topLanguageCounts(signals: TheaterSignal[], market: Market) {
  const counts = new Map<string, number>();

  for (const signal of signals) {
    if (signal.joinedMarketRef?.id !== market.geoid) continue;
    const language = signal.language?.trim();
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .toSorted(([leftLanguage, leftCount], [rightLanguage, rightCount]) => {
      const countOrder = rightCount - leftCount;
      return countOrder || leftLanguage.localeCompare(rightLanguage);
    })
    .slice(0, 3)
    .map(([language]) => language);
}

export function buildGeoPack({
  market,
  theaterSignals,
  zones,
}: {
  market: Market;
  theaterSignals: TheaterSignal[];
  zones: TargetZone[];
}): GeoPack {
  const localities = zones.map((zone) => zone.locality);
  const googleTargets = [...localities, `${market.name} market DMA/metro`];
  const languages = topLanguageCounts(theaterSignals, market);
  const employers = market.employmentProxy?.topEmployers.slice(0, 5) ?? [];
  const metaTargets = zones.map((zone) => {
    const radius = zone.anchorCount >= 4 ? 5 : 3;
    return `${zone.locality}, suggested radius ${radius} miles`;
  });
  const languageLine = languages.length
    ? languages.join(", ")
    : "No cinema language mix captured for this market. Do not add language targeting from this artifact.";
  const employerLine = employers.length
    ? employers.join(", ")
    : "No matched top employer list in this market artifact.";
  const text = [
    `Xpat geo pack: ${market.name}`,
    "",
    "Google Ads location targets:",
    ...googleTargets.map((target) => `- ${target}`),
    "",
    "Meta geo targets:",
    ...metaTargets.map((target) => `- ${target}`),
    "Meta setup note: per the team's reported constraint, use geo and creative variants as the primary levers, not interest targeting.",
    "",
    "YouTube and creator language signals:",
    `- ${languageLine}`,
    "",
    "Employer campus areas, workforce proxy hint:",
    `- ${employerLine}`,
    "- Compliance caveat: employer/workforce proxy only. Do not infer individual location, nationality, or visa status.",
    "",
    "Evidence boundary: zones come from community place evidence and cinema language signals. They do not prove customers or ad outcomes.",
  ].join("\n");

  return {
    previewLines: [
      `Google: ${googleTargets.slice(0, 4).join(", ")}`,
      `Meta: ${metaTargets.slice(0, 4).join(", ")}`,
      `Languages: ${languageLine}`,
      `Employer proxy: ${employerLine}`,
    ],
    text,
  };
}

function fitFromScore(score: number): PlatformFit {
  if (score >= 70) return "strong";
  if (score >= 45) return "possible";
  return "weak";
}

function channelScore(channels: ChannelFit[], ids: string[]) {
  return Math.max(0, ...channels.filter((channel) => ids.includes(channel.id)).map((channel) => channel.score));
}

function personaSignal(persona: PersonaFit) {
  const top = persona.contributions[0];
  return top ? top.label.toLowerCase() : "market evidence";
}

function combineFit(persona: PersonaFit, channel: number) {
  return fitFromScore((persona.score * 0.45) + (channel * 0.55));
}

export function buildPlatformRouting({
  channels,
  personas,
}: {
  channels: ChannelFit[];
  personas: Array<PersonaFit & { name: string }>;
}): PlatformRouteRow[] {
  const google = channelScore(channels, ["google-search"]);
  const meta = channelScore(channels, ["meta"]);
  const creator = channelScore(channels, ["youtube-creators", "creator-sponsorship"]);
  const appSearch = google * 0.75;

  return personas.map((persona) => ({
    cells: [
      {
        fit: combineFit(persona, google),
        platform: "Google Search",
        why: `${personaSignal(persona)} aligns with corridor and comparison-keyword testing.`,
      },
      {
        fit: combineFit(persona, meta),
        platform: "Meta",
        why: "Per the team's reported constraint, use zone geography and creative variants as the primary levers, not interest targeting.",
      },
      {
        fit: combineFit(persona, creator),
        platform: "YouTube/creator",
        why: `${personaSignal(persona)} can shape creator scripts and language-led placements.`,
      },
      {
        fit: combineFit(persona, appSearch),
        platform: "Apple Search Ads",
        why: "Use app-store keyword coverage once ASA and MMP exports can join install source to outcomes.",
      },
    ],
    personaName: persona.name,
  }));
}

export function buildCompetitorVisibility(records: CompetitorAdRecord[]): CompetitorVisibility {
  const captured = records.filter((record) => record.headline || record.screenshotPath);
  const selected = (captured.length > 0 ? captured : records).slice(0, 4);
  const capturedAt = selected.find((record) => record.capturedAt)?.capturedAt ?? null;

  return {
    capturedAt,
    framing:
      "Public ad libraries show competitor creative, not where it delivers. Per-geo competitive pressure is only visible in Xpat's own Google Ads Auction Insights segmented by geo. That export is data ask #5.",
    records: selected.map((record) => ({
      competitor: record.competitor,
      headline: record.headline ?? record.caveat ?? "No parseable public creative captured in this sweep.",
      platform: record.platform,
      sourceUrl: record.sourceUrl,
      status: record.status ?? (record.headline ? "captured" : "no-public-ads-captured"),
    })),
    state: captured.length > 0 ? "captured" : records.length > 0 ? "no-capture" : "connector-needed",
  };
}
