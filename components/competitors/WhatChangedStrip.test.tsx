import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FxSnapshot } from "@/lib/data/fx";
import { findCopyViolations } from "../../scripts/check-copy.mjs";
import { WhatChangedStrip } from "./WhatChangedStrip";

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
    ],
  },
];

describe("WhatChangedStrip", () => {
  it("renders quote deltas from consecutive snapshots", () => {
    const html = renderToStaticMarkup(<WhatChangedStrip snapshots={snapshots} />);

    expect(html).toContain("What changed");
    expect(html).toContain("2 days tracked, trend line unlocks at 7");
    expect(html).toContain("Remitly 94.91 to 94.76 since Jul 3");
    expect(html).toContain("Down");
    expect(findCopyViolations(html, "components/competitors/WhatChangedStrip.tsx")).toEqual([]);
  });
});
