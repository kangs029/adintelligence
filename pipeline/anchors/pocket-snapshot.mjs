import { evaluateAnchorCandidate } from "./qa-rules.mjs";
import { sanitizePublicAnchorTags } from "./sanitize-tags.mjs";

const SAMPLE_KIND_MAP = {
  temples: "temple",
  groceries: "grocery",
  cricket: "cricket",
};

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseOsmRef(link) {
  const match = String(link ?? "").match(/openstreetmap\.org\/(node|way|relation)\/(\d+)/u);
  if (!match) {
    return undefined;
  }

  return {
    type: match[1],
    id: match[2],
    key: `${match[1]}/${match[2]}`,
  };
}

export function buildOverpassIdQuery(refs) {
  const grouped = refs.reduce((groups, ref) => {
    groups[ref.type] ??= new Set();
    groups[ref.type].add(ref.id);
    return groups;
  }, {});
  const lines = ["[out:json][timeout:25];", "("];

  for (const type of ["node", "way", "relation"]) {
    const ids = [...(grouped[type] ?? [])].sort((left, right) => Number(left) - Number(right));
    if (ids.length) {
      lines.push(`${type}(id:${ids.join(",")});`);
    }
  }

  lines.push(");", "out center tags;");
  return lines.join("\n");
}

export function chunkRefs(refs, size = 40) {
  const chunks = [];
  for (let index = 0; index < refs.length; index += size) {
    chunks.push(refs.slice(index, index + size));
  }
  return chunks;
}

export function collectPocketSamples(pockets) {
  const samples = [];

  for (const pocket of pockets) {
    if (!String(pocket.geoid ?? "").startsWith("31000US")) {
      continue;
    }

    for (const [sourceKind, kind] of Object.entries(SAMPLE_KIND_MAP)) {
      for (const sample of pocket.community?.samples?.[sourceKind] ?? []) {
        const ref = parseOsmRef(sample.link);
        if (!ref) {
          continue;
        }
        samples.push({
          kind,
          marketGeoid: pocket.geoid,
          name: sample.name,
          ref,
        });
      }
    }
  }

  return samples.sort((left, right) => {
    const marketOrder = left.marketGeoid.localeCompare(right.marketGeoid);
    const kindOrder = left.kind.localeCompare(right.kind);
    return marketOrder || kindOrder || left.ref.key.localeCompare(right.ref.key);
  });
}

export function buildPocketMarketRollups({ pockets, markets }) {
  const marketByGeoid = new Map(markets.map((market) => [market.geoid, market]));
  const rollups = {};

  for (const pocket of pockets) {
    const geoid = pocket.geoid;
    const market = marketByGeoid.get(geoid);
    if (!market) {
      continue;
    }

    const temples = pocket.community?.temples ?? 0;
    const groceries = pocket.community?.groceries ?? 0;
    const cricket = pocket.community?.cricket ?? 0;
    const theaters = 0;
    const total = temples + groceries + cricket + theaters;
    const asianIndianPopulation = market.population?.asianIndian ?? 0;

    rollups[geoid] = {
      temples,
      groceries,
      cricket,
      theaters,
      per10kAI: asianIndianPopulation > 0 ? round((total / asianIndianPopulation) * 10_000) : 0,
    };
  }

  return Object.fromEntries(Object.entries(rollups).sort(([left], [right]) => left.localeCompare(right)));
}

function coordinateForElement(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  return { lat, lng };
}

function osmUrl(ref) {
  return `https://www.openstreetmap.org/${ref.type}/${ref.id}`;
}

export function anchorsFromPocketSamples({ samples, elements }) {
  const elementByKey = new Map(elements.map((element) => [`${element.type}/${element.id}`, element]));
  const anchors = [];

  for (const sample of samples) {
    const element = elementByKey.get(sample.ref.key);
    const coordinates = element ? coordinateForElement(element) : undefined;
    if (!element || !coordinates) {
      continue;
    }

    const tags = sanitizePublicAnchorTags(element.tags ?? {});
    const name = String(tags.name ?? sample.name ?? `${sample.kind} ${sample.ref.id}`);
    const qa = evaluateAnchorCandidate({
      kind: sample.kind,
      name,
      tags,
    });

    if (qa.exclude) {
      continue;
    }

    anchors.push({
      id: `${sample.marketGeoid}:${sample.ref.key}`,
      kind: sample.kind,
      name,
      lat: coordinates.lat,
      lng: coordinates.lng,
      marketGeoid: sample.marketGeoid,
      osmUrl: osmUrl(sample.ref),
      tags,
      qaFlags: qa.qaFlags,
    });
  }

  return anchors.sort((left, right) => left.id.localeCompare(right.id));
}
