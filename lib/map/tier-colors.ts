export const TIER_COLORS = {
  1: "#2DD4BF",
  2: "#1FA396",
  3: "#177A72",
  4: "#3A4148",
} as const;

export const MARKET_TIER_COLOR_EXPRESSION = [
  "match",
  ["get", "tier"],
  1,
  TIER_COLORS[1],
  2,
  TIER_COLORS[2],
  3,
  TIER_COLORS[3],
  TIER_COLORS[4],
];

export const MARKET_TIER_RADIUS_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["zoom"],
  3,
  ["max", 3.5, ["*", ["get", "markerRadius"], 0.85]],
  6,
  ["get", "markerRadius"],
  9,
  ["*", ["get", "markerRadius"], 1.6],
];

export const MARKET_TIER_STROKE_COLOR_EXPRESSION = [
  "match",
  ["get", "tier"],
  1,
  "#D6FFF9",
  3,
  "rgba(45,212,191,0.4)",
  4,
  "#6C7280",
  "#0B0C0F",
];

export const MARKET_TIER_STROKE_WIDTH_EXPRESSION = [
  "match",
  ["get", "tier"],
  1,
  2.25,
  3,
  1,
  4,
  1,
  1.25,
];

export const tierLegendItems = [
  { tier: 1, label: "Tier 1 launch planning", color: TIER_COLORS[1] },
  { tier: 2, label: "Tier 2 growth", color: TIER_COLORS[2] },
  { tier: 3, label: "Tier 3 discovery", color: TIER_COLORS[3] },
  { tier: 4, label: "Tier 4 audit hold", color: TIER_COLORS[4] },
] as const;
