import { join } from "node:path";

import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";
import { classifyReviewThemes } from "../competitors/review-themes.mjs";
import {
  buildSwitchMomentsArtifactFromReviews,
  isRenderableSwitchMoment,
  latestRawReviews,
  latestSwitchMomentsArtifact,
  SWITCH_MOMENTS_ARTIFACT_FILE,
  switchIntentRules,
  tagSwitchIntentExcerpt,
} from "../competitors/switch-intent.mjs";

export {
  buildSwitchMomentsArtifactFromReviews as buildSwitchMomentsArtifact,
  isRenderableSwitchMoment,
  switchIntentRules,
  tagSwitchIntentExcerpt,
};

export async function runSwitchMoments({ root = process.cwd() } = {}) {
  const reviewsArtifact = latestRawReviews({ root });
  if (!reviewsArtifact) {
    const existing = latestSwitchMomentsArtifact({ root });
    if (existing?.data?.scannedExcerpts === existing?.data?.sourceReviewExcerpts) {
      return existing;
    }
    throw new Error("data/raw/reviews/latest.json is required to regenerate switch moments from the full review corpus.");
  }

  const artifact = buildSwitchMomentsArtifactFromReviews({
    classifyThemes: classifyReviewThemes,
    generatedAt: reviewsArtifact.meta.generatedAt,
    reviews: reviewsArtifact.data.reviews,
  });
  await writeDeterministicJsonPreservingArrays(join(root, SWITCH_MOMENTS_ARTIFACT_FILE), artifact);
  return artifact;
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  await runSwitchMoments();
}
