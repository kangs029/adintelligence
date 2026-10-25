import { describe, expect, it, vi } from "vitest";

import { nextSeasonalMoments, type SeasonalMoment } from "./seasonal";

const moments: SeasonalMoment[] = [
  {
    end: "2026-07-01",
    id: "expired",
    name: "Expired",
    play: "Expired play",
    sourceNote: "Curated seasonal planning window.",
    start: "2026-06-01",
  },
  {
    end: "2026-08-01",
    id: "current",
    name: "Current",
    play: "Current play",
    sourceNote: "Curated seasonal planning window.",
    start: "2026-07-10",
  },
  {
    end: "2026-09-01",
    id: "next",
    name: "Next",
    play: "Next play",
    sourceNote: "Curated seasonal planning window.",
    start: "2026-08-10",
  },
];

describe("nextSeasonalMoments", () => {
  it("uses the supplied date for deterministic selection", () => {
    expect(nextSeasonalMoments(moments, new Date("2026-07-06T00:00:00.000Z")).map((moment) => moment.id)).toEqual([
      "current",
      "next",
    ]);
  });

  it("defaults to the runtime date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));

    try {
      expect(nextSeasonalMoments(moments).map((moment) => moment.id)).toEqual(["next"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
