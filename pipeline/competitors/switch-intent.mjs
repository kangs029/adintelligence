import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SWITCH_MOMENTS_ARTIFACT_FILE = join("data", "artifacts", "switch-moments.json");
export const RAW_REVIEWS_FILE = join("data", "raw", "reviews", "latest.json");

export const switchIntentRules = [
  { label: "switched to", pattern: /\bswitched\s+to\b/iu },
  { label: "switching from", pattern: /\bswitching\s+from\b/iu },
  { label: "moved to", pattern: /\bmoved\s+to\b/iu },
  { label: "moving my transfers", pattern: /\bmoving\s+my\s+transfers?\b/iu },
  { label: "uninstall", pattern: /\buninstall(?:ed|ing)?\b/iu },
  { label: "delete", pattern: /\bdelet(?:e|ed|ing)\b/iu },
  { label: "left provider", pattern: /\bleft\s+(?:wise|remitly|xoom|western union|xpat|remit2any|aspora|crobo|provider|app)\b/iu },
];

const unsafeRenderedTextPatterns = [
  /[\u2013\u2014]/u,
  /\bspend\b/iu,
  /\bCAC\b/iu,
  /\bCPA\b/iu,
  /\bconversion rate\b/iu,
  /\bKYC completion\b/iu,
  /\bfirst transfer\b/iu,
  /\brepeat transfer\b/iu,
  /\bLTV\b/iu,
  /\bROI\b/iu,
  /\bdelivery of a specific ad\b/iu,
  /\bspecific geo\b/iu,
  /\bindividual identity\b/iu,
  /\bvisa status\b/iu,
];

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function reviewText(review) {
  return `${review.title ?? ""} ${review.text ?? ""}`;
}

function reviewKey(review) {
  return `${review.competitor}:${review.store}:${review.id}`;
}

export function tagSwitchIntentExcerpt(text) {
  const value = String(text ?? "");
  for (const rule of switchIntentRules) {
    if (!rule.pattern.test(value)) continue;
    if (rule.label === "uninstall" && /\breinstall(?:ed|ing)?\b/iu.test(value)) continue;
    if (isFalsePositiveSwitchMatch(rule.label, value)) continue;
    return rule.label;
  }
  return null;
}

function isFalsePositiveSwitchMatch(label, value) {
  if (label === "moved to") {
    return /\bmoved\s+to\s+(?:the\s+)?(?:united states|u\.?s\.?a?\.?|america)\b/iu.test(value);
  }

  if (label === "switched to") {
    return /\bswitched\s+to\s+(?:a\s+)?(?:debit|credit|bank|card|account)\b/iu.test(value);
  }

  if (label === "delete") {
    return !/\bdelet(?:e|ed|ing)\s+(?:this\s+|the\s+|my\s+)?(?:app|account)\b/iu.test(value);
  }

  if (label === "uninstall") {
    return !/\b(?:send|sending|sent|transfer|transaction|money|alternative|not useful|useless)\b/iu.test(value);
  }

  return false;
}

export function switchMomentFromReview(review, { classifyThemes = () => [] } = {}) {
  const matchedPattern = tagSwitchIntentExcerpt(reviewText(review));
  if (!matchedPattern) return null;

  const themes = classifyThemes(review);

  return {
    excerpt: review.text,
    id: reviewKey(review),
    matchedPattern,
    provider: review.competitor,
    reviewDate: review.date,
    store: review.store,
    theme: themes[0] ?? "Review excerpt",
  };
}

export function switchMomentsFromReviews(reviews, { classifyThemes = () => [] } = {}) {
  return reviews
    .map((review) => switchMomentFromReview(review, { classifyThemes }))
    .filter(Boolean)
    .filter((moment) => isRenderableSwitchMoment(moment.excerpt))
    .sort((left, right) => right.reviewDate.localeCompare(left.reviewDate) || left.id.localeCompare(right.id));
}

export function isRenderableSwitchMoment(text) {
  return !unsafeRenderedTextPatterns.some((pattern) => pattern.test(String(text ?? "")));
}

export function buildSwitchMomentsArtifactFromReviews({
  classifyThemes = () => [],
  generatedAt,
  reviews,
} = {}) {
  const sourceReviews = Array.isArray(reviews) ? reviews : [];
  const matchedMoments = sourceReviews
    .map((review) => switchMomentFromReview(review, { classifyThemes }))
    .filter(Boolean);
  const moments = matchedMoments
    .filter((moment) => isRenderableSwitchMoment(moment.excerpt))
    .sort((left, right) => right.reviewDate.localeCompare(left.reviewDate) || left.id.localeCompare(right.id));

  return {
    meta: {
      caveats: [
        "Public review excerpts showing switch intent. Presence evidence for messaging tests, not conversion data.",
        "This artifact scans the full public review corpus during review mining before theme examples are truncated.",
        "Matched excerpts that fail the rendered-copy guard are excluded rather than rewritten.",
      ],
      family: "switch-moments",
      generatedAt,
      method:
        "Rule pass over full public App Store and Google Play review excerpts using transparent switch-intent keyword patterns.",
      provenance: "derived",
      refreshCadence: "weekly with review-theme refresh",
      source: "data/raw/reviews/latest.json",
      version: 1,
    },
    data: {
      moments,
      rules: switchIntentRules.map((rule) => ({
        label: rule.label,
        pattern: rule.pattern.source,
      })),
      scannedExcerpts: sourceReviews.length,
      sourceReviewExcerpts: sourceReviews.length,
      status: "ok",
      switchIntentCount: moments.length,
      unsafeMatchCount: matchedMoments.length - moments.length,
    },
  };
}

export function latestRawReviews({ root = process.cwd() } = {}) {
  return readJsonIfExists(join(root, RAW_REVIEWS_FILE));
}

export function latestSwitchMomentsArtifact({ root = process.cwd() } = {}) {
  return readJsonIfExists(join(root, SWITCH_MOMENTS_ARTIFACT_FILE));
}
