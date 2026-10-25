import type { Market } from "@/lib/data/markets";
import type { ReviewThemeGroup } from "./counter-moves";

function anchorCount(market: Market) {
  const anchors = market.anchorSummary;
  if (!anchors) return 0;
  return anchors.temples + anchors.groceries + anchors.cricket + anchors.theaters;
}

function strongestAnchorPhrase(market: Market) {
  const anchors = market.anchorSummary;
  if (!anchors || anchorCount(market) === 0) return "community-place evidence still needs local verification";

  const pairs = [
    { label: "temple", value: anchors.temples },
    { label: "grocery", value: anchors.groceries },
    { label: "cricket", value: anchors.cricket },
    { label: "cinema", value: anchors.theaters },
  ].sort((left, right) => right.value - left.value);
  const top = pairs[0];

  return `${top.value} audited ${top.label} places and ${anchors.per10kAI.toFixed(1)} community places per 10k Asian Indian residents`;
}

function topReviewPain(groups: ReviewThemeGroup[]) {
  return groups
    .filter((group) => group.sampleSize > 0 && group.competitor !== "Xpat")
    .flatMap((group) =>
      group.themes
        .filter((theme) => theme.count > 0 && theme.sharePct > 0)
        .map((theme) => ({ competitor: group.competitor, theme })),
    )
    .sort((left, right) => right.theme.sharePct - left.theme.sharePct)[0];
}

export function composeWedgeLine(market: Market, reviewThemes: ReviewThemeGroup[]) {
  const pain = topReviewPain(reviewThemes);
  const concentration = `${market.concentration.multipleOfUS.toFixed(1)}x national Asian Indian concentration`;
  const anchorPhrase = strongestAnchorPhrase(market);

  if (!pain) {
    return `${concentration}, ${anchorPhrase}, and no current review-frequency theme is strong enough to use as a counter-move. This market needs a trust-first entry hypothesis with proof gates.`;
  }

  return `${concentration}, ${anchorPhrase}, and public ${pain.competitor} reviews most often surface ${pain.theme.theme.toLowerCase()} at ${pain.theme.sharePct.toFixed(1)}%. This market rewards a trust-first, community-backed entry hypothesis.`;
}
