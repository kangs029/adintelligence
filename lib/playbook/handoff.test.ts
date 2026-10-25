import { describe, expect, it } from "vitest";

import {
  isPlaybookMarketGeoid,
  playbookHandoffHref,
  PLAYBOOK_LAST_MARKET_KEY,
} from "./handoff";

describe("playbook handoff links", () => {
  it("builds market-scoped playbook URLs with anchors", () => {
    expect(playbookHandoffHref("31000US45940", "community")).toBe(
      "/playbook?market=31000US45940#community",
    );
    expect(playbookHandoffHref("31000US42660", "content-seo")).toBe(
      "/playbook?market=31000US42660#content-seo",
    );
  });

  it("accepts only CBSA-style playbook market geoids for stored handoffs", () => {
    expect(isPlaybookMarketGeoid("31000US45940")).toBe(true);
    expect(isPlaybookMarketGeoid("")).toBe(false);
    expect(isPlaybookMarketGeoid("#community")).toBe(false);
    expect(isPlaybookMarketGeoid("javascript:alert(1)")).toBe(false);
  });

  it("uses a namespaced localStorage key", () => {
    expect(PLAYBOOK_LAST_MARKET_KEY).toBe("xpat-os:last-playbook-market");
  });
});
