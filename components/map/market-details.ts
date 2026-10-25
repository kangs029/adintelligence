import { buildPersonaInsightLines } from "./persona-insights";
import { displayAnchorName } from "@/lib/data/anchor-display";

type AnchorRow = {
  id: string;
  kind: string;
  marketGeoid: string;
  name: string;
  lat?: number;
  lng?: number;
  osmUrl: string;
  qaFlags: string[];
  displayName?: string;
  duplicateCount?: number;
};

type TheaterSignal = {
  joinedMarketRef?: { kind?: string; id?: string };
  language?: string;
  chain?: string;
  theaterName: string;
};

type MarketLike = {
  geoid: string;
  name: string;
  state?: string;
  tier: number;
  states: string[];
  population?: { asianIndian?: number };
  anchorSummary?: {
    temples: number;
    groceries: number;
    cricket: number;
    theaters: number;
    per10kAI: number;
  };
};

export type MarketDrawerModel = ReturnType<typeof buildMarketDrawerModel>;

function theaterLabel(theater: { chain?: string; theaterName: string }) {
  const chain = theater.chain
    ?.replace(/\b(Entertainment|Theatres?|Cinemas?)\b/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const theaterName = theater.theaterName.trim().replace(/\s+/gu, " ");

  if (!chain || new RegExp(`^${chain}\\b`, "iu").test(theaterName)) {
    return theaterName;
  }

  return `${chain} ${theaterName}`;
}

function normalizedTheaterName(label: string) {
  return label
    .toLowerCase()
    .replace(/\b(amc|cinemark|regal|entertainment|theatres?|cinemas?)\b/giu, " ")
    .replace(/\bwith\s+imax\b.*$/iu, " ")
    .replace(/\b(imax|dolby|xd)\b/giu, " ")
    .replace(/\+/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function theaterLabelRank(label: string) {
  const hasKnownChain = /^(amc|cinemark|regal)\b/iu.test(label) ? 0 : 10;
  const hasFormatSuffix = /\b(with imax|dolby|xd)\b|,/iu.test(label) ? 5 : 0;

  return hasKnownChain + hasFormatSuffix + label.length / 1000;
}

function dedupeTheaterLabels(theaters: Array<{ chain?: string; theaterName: string }>) {
  const byName = new Map<string, { label: string; rank: number }>();

  for (const theater of theaters) {
    const label = theaterLabel(theater);
    const key = normalizedTheaterName(label);
    const rank = theaterLabelRank(label);
    const existing = byName.get(key);

    if (!existing || rank < existing.rank) {
      byName.set(key, { label, rank });
    }
  }

  return [...byName.values()].map((entry) => entry.label);
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function cinemaMarketIds(market: MarketLike) {
  const legacyAliases: Record<string, string[]> = {
    "31000US19430": ["dayton-beavercreek-oh"],
    "31000US19740": ["denver-aurora-co"],
    "31000US26900": ["indianapolis-greenwood-in"],
    "31000US33460": ["minneapolis-plymouth-mn"],
    "31000US35300": ["new-haven-stamford-ct"],
    "31000US41180": ["st-louis-saint-louis-mo"],
    "31000US45300": ["tampa-clearwater-fl"],
  };
  const states = market.states.length ? market.states : market.state ? [market.state] : [];
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

function signalsForMarket(signals: TheaterSignal[], market: MarketLike) {
  const marketIds = cinemaMarketIds(market);

  return signals.filter((signal) => {
    const id = signal.joinedMarketRef?.id;
    return Boolean(id && marketIds.has(id));
  });
}

function languageCounts(signals: TheaterSignal[]) {
  const counts: Record<string, number> = {};

  for (const signal of signals) {
    const language = signal.language?.trim();
    if (!language) continue;
    counts[language] = (counts[language] ?? 0) + 1;
  }

  return counts;
}

function languageSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([leftLanguage, leftCount], [rightLanguage, rightCount]) => {
      const countOrder = rightCount - leftCount;
      return countOrder || leftLanguage.localeCompare(rightLanguage);
    })
    .slice(0, 3)
    .map(([language]) => language)
    .join(", ");
}

function cinemaEvidenceForMarket({
  capturedAt,
  market,
  theaterSignals,
}: {
  capturedAt: string;
  market: MarketLike;
  theaterSignals: TheaterSignal[];
}) {
  const signals = signalsForMarket(theaterSignals, market);
  const counts = languageCounts(signals);
  const exampleTheaters = dedupeTheaterLabels(signals);

  return {
    capturedAt,
    exampleTheaters: exampleTheaters.slice(0, 4),
    languageCounts: counts,
    languageSummary: languageSummary(counts),
    theaterSignalCount: exampleTheaters.length,
  };
}

const anchorKindPriority: Record<string, number> = {
  temple: 0,
  grocery: 1,
  cricket: 2,
  theater: 3,
};

function anchorPriority(anchor: AnchorRow) {
  return anchorKindPriority[anchor.kind] ?? 9;
}

function normalizedAnchorName(name: string) {
  return name.trim().replace(/\s+/gu, " ").toLowerCase();
}

function isGenericAnchorName(anchor: AnchorRow) {
  const normalized = normalizedAnchorName(anchor.name);

  return (
    anchor.qaFlags.includes("generic-name") ||
    normalized === "cricket ground" ||
    normalized === "cricket field" ||
    normalized === "cricket - soccer fields"
  );
}

function shapeAnchorSamples(anchors: AnchorRow[]) {
  const grouped = new Map<string, AnchorRow & { duplicateCount?: number; displayName?: string }>();

  for (const anchor of anchors) {
    const shouldCollapse = isGenericAnchorName(anchor);
    const key = shouldCollapse
      ? `${anchor.kind}:${normalizedAnchorName(anchor.name)}`
      : `${anchor.id}`;
    const existing = grouped.get(key);

    if (existing) {
      const duplicateCount = (existing.duplicateCount ?? 1) + 1;
      grouped.set(key, {
        ...existing,
        duplicateCount,
        displayName: `${displayAnchorName(existing)} ×${duplicateCount}`,
      });
      continue;
    }

    grouped.set(key, {
      ...anchor,
      duplicateCount: shouldCollapse ? 1 : undefined,
      displayName: displayAnchorName(anchor),
    });
  }

  return [...grouped.values()].sort((left, right) => {
    const priority = anchorPriority(left) - anchorPriority(right);
    if (priority !== 0) return priority;

    const named = Number(isGenericAnchorName(left)) - Number(isGenericAnchorName(right));
    if (named !== 0) return named;

    return left.name.localeCompare(right.name);
  });
}

export function buildMarketDrawerModel({
  market,
  anchorsArtifact,
  cinemaArtifact,
  benchmarkMarkets = [market],
}: {
  market: MarketLike;
  anchorsArtifact: { data: { anchors: AnchorRow[] } };
  cinemaArtifact: { data: { capturedAt: string; theaterSignals?: TheaterSignal[] } };
  benchmarkMarkets?: MarketLike[];
}) {
  const cinemaEvidence = cinemaEvidenceForMarket({
    capturedAt: cinemaArtifact.data.capturedAt,
    market,
    theaterSignals: cinemaArtifact.data.theaterSignals ?? [],
  });
  const { languageCounts: cinemaLanguageCounts, ...cinema } = cinemaEvidence;

  return {
    anchorRows: shapeAnchorSamples(
      anchorsArtifact.data.anchors.filter((anchor) => anchor.marketGeoid === market.geoid),
    ),
    anchorTotal:
      (market.anchorSummary?.temples ?? 0) +
      (market.anchorSummary?.groceries ?? 0) +
      (market.anchorSummary?.cricket ?? 0) +
      (market.anchorSummary?.theaters ?? 0),
    cinema,
    personaInsights: buildPersonaInsightLines({
      market,
      benchmarkMarkets,
      cinema: {
        theaterSignalCount: cinema.theaterSignalCount,
        languageCounts: cinemaLanguageCounts,
      },
    }),
  };
}
