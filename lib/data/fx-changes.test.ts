import { describe, expect, it } from "vitest";

import { validateClaims } from "@/lib/claims/contract";
import { buildFxChangeItems, fxChangeStatusLabel } from "./fx-changes";
import type { FxSnapshot } from "./fx";

const snapshots: FxSnapshot[] = [
  {
    capturedAt: "2026-07-03T00:00:00.000Z",
    midMarket: { asOf: "2026-07-03", rate: 95.3, source: "Frankfurter v2" },
    providers: [
      {
        capturedAt: "2026-07-03T07:46:21.700407Z",
        feeUSD: 0,
        method: "page",
        provider: "Remitly",
        quotedRate: 94.906,
        receiveAmountFor1000USD: 94906,
        sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
      },
      {
        capturedAt: null,
        caveat: "No public machine-readable quote path found.",
        feeUSD: null,
        method: "connector-needed",
        provider: "Crobo",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://www.crobo.money/",
      },
    ],
  },
  {
    capturedAt: "2026-07-05T00:00:00.000Z",
    midMarket: { asOf: "2026-07-04", rate: 95.22, source: "Frankfurter v2" },
    providers: [
      {
        capturedAt: "2026-07-05T00:45:54.949802Z",
        feeUSD: 0,
        method: "page",
        provider: "Remitly",
        quotedRate: 94.76,
        receiveAmountFor1000USD: 94760,
        sourceUrl: "https://wise.com/us/compare/remitly-usd-to-inr",
      },
      {
        capturedAt: null,
        caveat: "No public machine-readable quote path found.",
        feeUSD: null,
        method: "connector-needed",
        provider: "Crobo",
        quotedRate: null,
        receiveAmountFor1000USD: null,
        sourceUrl: "https://www.crobo.money/",
      },
    ],
  },
];

describe("FX change items", () => {
  it("compares quoted providers against the previous snapshot day", () => {
    const changes = buildFxChangeItems(snapshots);

    expect(changes).toEqual([
      {
        date: "2026-07-05T00:00:00.000Z",
        direction: "down",
        evidenceLink: "https://wise.com/us/compare/remitly-usd-to-inr",
        provider: "Remitly",
        whatChanged: "Remitly 94.91 to 94.76 since Jul 3",
      },
    ]);
    expect(validateClaims(changes, "copy")).toEqual([]);
  });

  it("labels short tracking windows honestly", () => {
    expect(fxChangeStatusLabel(snapshots)).toBe("2 days tracked, trend line unlocks at 7");
  });
});
