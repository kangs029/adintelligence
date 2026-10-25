export type ClaimRule =
  | "anchor-evidence-boundary"
  | "benchmark-reference-required"
  | "estimate-label-required"
  | "public-data-local-claim"
  | "public-data-performance-claim"
  | "workforce-proxy-boundary";

export type BannedClaim = {
  pattern: RegExp;
  term: string;
};

export const bannedPerformanceClaims: BannedClaim[] = [
  { pattern: /\bspend\b/iu, term: "spend" },
  { pattern: /\bCAC\b/iu, term: "CAC" },
  { pattern: /\bCPA\b/iu, term: "CPA" },
  { pattern: /\bconversion rate\b/iu, term: "conversion rate" },
  { pattern: /\bKYC completion\b/iu, term: "KYC completion" },
  { pattern: /\bfirst transfer\b/iu, term: "first transfer" },
  { pattern: /\brepeat transfer\b/iu, term: "repeat transfer" },
  { pattern: /\bLTV\b/iu, term: "LTV" },
  { pattern: /\bROI\b/iu, term: "ROI" },
  { pattern: /\bdelivery of a specific ad\b/iu, term: "delivery of a specific ad" },
  { pattern: /\bspecific geo\b/iu, term: "specific geo" },
  { pattern: /\bindividual identity\b/iu, term: "individual identity" },
  { pattern: /\bvisa status\b/iu, term: "visa status" },
];

export const allowedMissingDataContext = [
  /connector[- ]needed/iu,
  /requires? Xpat/iu,
  /Xpat exports?/iu,
  /export schema/iu,
  /\bschema\b/iu,
  /\bmissing\b/iu,
  /does not prove/iu,
  /not prove/iu,
  /do not infer/iu,
  /not campaign/iu,
  /\bnever\b/iu,
  /not implied/iu,
  /no .* implied/iu,
];
