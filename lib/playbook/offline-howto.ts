import type { Anchor } from "@/lib/data/anchors";

export type SurfaceHowTo = {
  activationIdea: string;
  assetNeeded: string;
  boundary: string;
  howToMeasure: string;
};

export function howToForSurface(kind: Anchor["kind"]): SurfaceHowTo {
  if (kind === "grocery") {
    return {
      activationIdea: "In-store TV loop, counter QR card, pamphlet stack, bag insert, or receipt insert.",
      assetNeeded: "15s screen loop, city landing page, QR/referral code, and owner-approved counter creative.",
      boundary: "Community presence evidence only, proves nothing about customers.",
      howToMeasure: "Use store-specific QR and source tags such as sj-grocery-name-2026.",
    };
  }

  if (kind === "temple") {
    return {
      activationIdea: "Festival table, newsletter mention, bulletin flyer, cultural-school event, or disclosed education sponsorship.",
      assetNeeded: "Soft education copy, organizer-approved QR creative, and compliance-reviewed claims.",
      boundary: "Community presence evidence only, proves nothing about customers.",
      howToMeasure: "Use event QR and referral-code source tags by organizer, date, and market.",
    };
  }

  if (kind === "cricket") {
    return {
      activationIdea: "Jersey sponsorship, boundary banner, scorecard mention, MVP award, team code, or match-day QR.",
      assetNeeded: "Jersey or banner artwork, short URL, referral code, and match-day landing page.",
      boundary: "Community presence evidence only, proves nothing about customers.",
      howToMeasure: "Use team or match source tags and QR scans by league, match, and market.",
    };
  }

  return {
    activationIdea: "Fan-show sponsorship, theater lobby QR, premiere-night booth, poster co-placement, or language-specific offer.",
    assetNeeded: "Movie-night QR creative, language-specific landing page, and theater or organizer approval.",
    boundary: "Community presence evidence only, proves nothing about customers.",
    howToMeasure: "Use theater, movie, language, and show-window source tags on QR links.",
  };
}
