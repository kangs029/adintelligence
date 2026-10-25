export const PLAYBOOK_LAST_MARKET_KEY = "xpat-os:last-playbook-market";

export const playbookHandoffAnchors = [
  "community",
  "channels",
  "messaging",
  "content-seo",
] as const;

export type PlaybookHandoffAnchor = (typeof playbookHandoffAnchors)[number];

export function isPlaybookMarketGeoid(value: string | null | undefined): value is string {
  return typeof value === "string" && /^31000US\d{5}$/u.test(value);
}

export function playbookHandoffHref(marketGeoid: string, anchor: PlaybookHandoffAnchor) {
  return `/playbook?market=${encodeURIComponent(marketGeoid)}#${anchor}`;
}
