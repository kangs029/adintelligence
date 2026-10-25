import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  writeDeterministicJson,
  writeDeterministicJsonPreservingArrays,
} from "../lib/provenance.mjs";
import { runReviews } from "./reviews.mjs";
import {
  buildSwitchMomentsArtifactFromReviews,
  SWITCH_MOMENTS_ARTIFACT_FILE,
} from "./switch-intent.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "review-themes.json");
const RAW_REVIEWS_FILE = join("data", "raw", "reviews", "latest.json");
const DASH_PATTERN = /[\u2013\u2014]/gu;
const DISPLAY_BLOCKED_PATTERNS = [
  /\bspend\b/iu,
  /\bCAC\b/u,
  /\bCPA\b/u,
  /\bconversion rate\b/iu,
  /\bKYC completion\b/iu,
  /\bfirst transfer\b/iu,
  /\brepeat transfer\b/iu,
  /\bLTV\b/u,
  /\bROI\b/u,
  /\bdelivery of a specific ad\b/iu,
  /\bspecific geo\b/iu,
  /\bindividual identity\b/iu,
  /\bvisa status\b/iu,
];

export const themeRules = [
  {
    patterns: [/\bfast\b/iu, /\bquick\b/iu, /\bminutes?\b/iu, /\binstant\b/iu, /\bslow\b/iu, /\bdelay(?:ed)?\b/iu],
    theme: "Speed",
  },
  {
    patterns: [/\bfee(?:s)?\b/iu, /\bcharge(?:d|s)?\b/iu, /\bcost\b/iu, /\bexpensive\b/iu, /\bhidden fee\b/iu],
    theme: "Fees",
  },
  {
    patterns: [/\brate(?:s)?\b/iu, /\bexchange\b/iu, /\binr\b/iu, /\brupee(?:s)?\b/iu],
    theme: "Rates",
  },
  {
    patterns: [/\bkyc\b/iu, /\bverification\b/iu, /\bverify\b/iu, /\bidentity\b/iu, /\bdocument(?:s)?\b/iu, /\bselfie\b/iu],
    theme: "KYC friction",
  },
  {
    patterns: [/\bfraud\b/iu, /\bscam\b/iu, /\bsafe\b/iu, /\bsecure\b/iu, /\blocked\b/iu, /\bblocked\b/iu, /\btrust\b/iu],
    theme: "Trust and safety",
  },
  {
    patterns: [/\bsupport\b/iu, /\bcustomer service\b/iu, /\bhelp\b/iu, /\bagent\b/iu, /\bchat\b/iu, /\bcall\b/iu],
    theme: "Support",
  },
  {
    patterns: [/\bbug(?:s)?\b/iu, /\bcrash(?:es|ed)?\b/iu, /\berror\b/iu, /\blogin\b/iu, /\bapp\b/iu, /\bfreeze\b/iu, /\bupdate\b/iu],
    theme: "App bugs",
  },
];

function roundShare(count, sampleSize) {
  if (sampleSize === 0) return 0;
  return Math.round((count / sampleSize) * 1000) / 10;
}

function reviewText(review) {
  return `${review.title ?? ""} ${review.text ?? ""}`;
}

function displaySafeReview(review) {
  return !DISPLAY_BLOCKED_PATTERNS.some((pattern) => pattern.test(reviewText(review)));
}

function displayEvidenceReview(review) {
  return displaySafeReview(review) && Number(review.rating) <= 3;
}

function sortEvidenceReviews(left, right) {
  return Number(left.rating) - Number(right.rating) || right.date.localeCompare(left.date);
}

export function classifyReviewThemes(review) {
  const text = reviewText(review);
  return themeRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.theme);
}

function exampleFromReview(review) {
  return {
    date: review.date,
    id: review.id,
    rating: review.rating,
    store: review.store,
    text: String(review.text ?? "").replace(DASH_PATTERN, "-"),
    title: review.title ? String(review.title).replace(DASH_PATTERN, "-") : review.title,
  };
}

function groupKey(review) {
  return `${review.competitor}::${review.store}`;
}

function dateWindow(reviews) {
  const dates = reviews.map((review) => review.date.slice(0, 10)).sort();
  return {
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}

function averageRating(reviews) {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((total, review) => total + Number(review.rating), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function emptyThemeRows() {
  return themeRules.map((rule) => ({
    count: 0,
    examples: [],
    sharePct: 0,
    theme: rule.theme,
  }));
}

function emptyConfiguredGroups(reviewApps, populatedKeys) {
  if (!reviewApps?.apps) return [];

  return reviewApps.apps.flatMap((app) =>
    ["ios", "android"]
      .filter((store) => !populatedKeys.has(`${app.competitor}::${store}`))
      .map((store) => ({
        competitor: app.competitor,
        averageRating: null,
        sampleSize: 0,
        store,
        themes: emptyThemeRows(),
        window: { from: null, to: null },
      })),
  );
}

export function reviewThemesFromReviews({
  generatedAt = new Date().toISOString(),
  reviewApps,
  reviews,
}) {
  const groups = new Map();

  for (const review of reviews) {
    const key = groupKey(review);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(review);
  }

  const dataGroups = [...groups.values()].map((groupReviews) => {
    const sortedReviews = [...groupReviews].sort((left, right) => right.date.localeCompare(left.date));
    const sampleSize = sortedReviews.length;
    const themes = themeRules.map((rule) => {
      const matching = sortedReviews.filter((review) => classifyReviewThemes(review).includes(rule.theme));
      return {
        count: matching.length,
        examples: matching
          .filter(displayEvidenceReview)
          .sort(sortEvidenceReviews)
          .slice(0, 3)
          .map(exampleFromReview),
        sharePct: roundShare(matching.length, sampleSize),
        theme: rule.theme,
      };
    });

    return {
      averageRating: averageRating(sortedReviews),
      competitor: sortedReviews[0].competitor,
      sampleSize,
      store: sortedReviews[0].store,
      themes,
      window: dateWindow(sortedReviews),
    };
  });

  const populatedKeys = new Set(dataGroups.map((group) => `${group.competitor}::${group.store}`));

  return {
    meta: {
      caveats: [
        "Theme counts use transparent keyword rules, not LLM-written summaries.",
        "A single review can count toward more than one theme.",
        "Public review themes do not prove acquisition, conversion, retention, or revenue performance.",
      ],
      family: "review-themes",
      generatedAt,
      method:
        "Rule-based classifier over public App Store and Google Play review excerpts. Themes are speed, fees, rates, KYC friction, trust and safety, support, and app bugs.",
      provenance: "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "data/raw/reviews/latest.json",
      version: 1,
    },
    data: {
      groups: [...dataGroups, ...emptyConfiguredGroups(reviewApps, populatedKeys)].sort(
        (left, right) =>
          `${left.competitor}-${left.store}`.localeCompare(`${right.competitor}-${right.store}`),
      ),
      rules: themeRules.map((rule) => ({
        patterns: rule.patterns.map((pattern) => pattern.source),
        theme: rule.theme,
      })),
    },
  };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function daysSince(value, now) {
  return (new Date(now).getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000);
}

export async function runReviewThemes({
  force = process.env.FORCE_REVIEW_SWEEP === "1",
  generatedAt = new Date().toISOString(),
  root = process.cwd(),
} = {}) {
  const artifactPath = join(root, ARTIFACT_FILE);
  const existing = readJsonIfExists(artifactPath);

  if (!force && existing?.meta?.generatedAt && daysSince(existing.meta.generatedAt, generatedAt) < 7) {
    return existing;
  }

  const reviewsArtifact =
    readJsonIfExists(join(root, RAW_REVIEWS_FILE)) ?? (await runReviews({ generatedAt, root }));
  const reviewApps = readJsonIfExists(join(root, "pipeline", "competitors", "review-apps.json"));
  const artifact = reviewThemesFromReviews({
    generatedAt: reviewsArtifact.meta?.generatedAt ?? generatedAt,
    reviewApps,
    reviews: reviewsArtifact.data.reviews,
  });
  const switchMomentsArtifact = buildSwitchMomentsArtifactFromReviews({
    classifyThemes: classifyReviewThemes,
    generatedAt: reviewsArtifact.meta?.generatedAt ?? generatedAt,
    reviews: reviewsArtifact.data.reviews,
  });

  await writeDeterministicJson(artifactPath, artifact);
  await writeDeterministicJsonPreservingArrays(join(root, SWITCH_MOMENTS_ARTIFACT_FILE), switchMomentsArtifact);
  return artifact;
}
