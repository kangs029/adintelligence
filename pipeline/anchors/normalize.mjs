import { evaluateAnchorCandidate } from "./qa-rules.mjs";
import { sanitizePublicAnchorTags } from "./sanitize-tags.mjs";

const GROCERY_SHOPS = new Set(["convenience", "grocery", "supermarket"]);

function coordinateForElement(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  return { lat, lng };
}

function inferKind(tags) {
  if (tags?.amenity === "place_of_worship") {
    return "temple";
  }

  if (tags?.sport === "cricket" || /\bcricket\b/iu.test(String(tags?.name ?? ""))) {
    return "cricket";
  }

  if (GROCERY_SHOPS.has(tags?.shop)) {
    return "grocery";
  }

  if (tags?.amenity === "cinema") {
    return "theater";
  }

  return undefined;
}

function osmUrl(element) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

function normalizeElement({ element, marketGeoid }) {
  const sourceTags = element.tags ?? {};
  const kind = inferKind(sourceTags);
  const coordinates = coordinateForElement(element);
  if (!kind || !coordinates) {
    return undefined;
  }

  const tags = sanitizePublicAnchorTags(sourceTags);
  const candidate = {
    kind,
    name: String(tags.name ?? `${kind} ${element.id}`),
    tags,
  };
  const qa = evaluateAnchorCandidate(candidate);
  if (qa.exclude) {
    return undefined;
  }

  return {
    id: `${marketGeoid}:${element.type}/${element.id}`,
    kind,
    name: candidate.name,
    lat: coordinates.lat,
    lng: coordinates.lng,
    marketGeoid,
    osmUrl: osmUrl(element),
    tags,
    qaFlags: qa.qaFlags,
  };
}

export function normalizeOverpassElements({ marketGeoid, elements }) {
  return elements
    .map((element) => normalizeElement({ element, marketGeoid }))
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
}
