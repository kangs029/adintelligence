const DHARMIC_RELIGIONS = new Set(["hindu", "jain", "sikh"]);

const SOUTH_ASIAN_NAME_PATTERNS = [
  /\bapna\b/iu,
  /\bbharat\b/iu,
  /\bbombay\b/iu,
  /\bchennai\b/iu,
  /\bdelhi\b/iu,
  /\bdesi\b/iu,
  /\bhyderabad\b/iu,
  /\bindia(n)?\b/iu,
  /\bnamaste\b/iu,
  /\bpatel\b/iu,
  /\bpunjab(i)?\b/iu,
];

const GENERIC_GROCERY_PATTERNS = [
  /\bindian creek\b/iu,
  /\bindian hill\b/iu,
  /\bindian river\b/iu,
  /\bindian trail\b/iu,
  /\bindiana\b/iu,
];

function tagValue(tags, key) {
  return String(tags?.[key] ?? "").trim();
}

function searchableText({ name, tags }) {
  return [name, tagValue(tags, "name"), tagValue(tags, "brand"), tagValue(tags, "cuisine"), tagValue(tags, "origin")]
    .filter(Boolean)
    .join(" ");
}

function hasSouthAsianEvidence(candidate) {
  const text = searchableText(candidate);
  return SOUTH_ASIAN_NAME_PATTERNS.some((pattern) => pattern.test(text));
}

function isMadrasOregonLeak(candidate) {
  const city = tagValue(candidate.tags, "addr:city").toLowerCase();
  const state = tagValue(candidate.tags, "addr:state").toUpperCase();
  return /\bmadras\b/iu.test(candidate.name) && city === "madras" && state === "OR";
}

export function evaluateAnchorCandidate(candidate) {
  const qaFlags = [];

  if (candidate.kind === "temple") {
    const religion = tagValue(candidate.tags, "religion").toLowerCase();
    if (religion && !DHARMIC_RELIGIONS.has(religion)) {
      return { exclude: true, qaFlags: ["non-dharmic-worship"] };
    }
  }

  if (candidate.kind === "grocery") {
    if (isMadrasOregonLeak(candidate)) {
      return { exclude: true, qaFlags: ["locality-name-leakage"] };
    }

    if (GENERIC_GROCERY_PATTERNS.some((pattern) => pattern.test(candidate.name))) {
      return { exclude: true, qaFlags: ["generic-grocery-match"] };
    }

    if (!hasSouthAsianEvidence(candidate)) {
      return { exclude: true, qaFlags: ["generic-grocery-match"] };
    }

    qaFlags.push("name-match");
  }

  return { exclude: false, qaFlags };
}
