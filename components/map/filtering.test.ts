import { describe, expect, it } from "vitest";

import {
  defaultMarketFilters,
  filterMarketFeatures,
  hiddenPopulationNotice,
  marketMapKpis,
} from "./filtering";

const features = [
  {
    type: "Feature",
    id: "a",
    geometry: { type: "Point", coordinates: [-121, 37] },
    properties: {
      geoid: "a",
      name: "San Jose",
      state: "CA",
      states: ["CA"],
      tier: 1,
      asianIndian: 202_000,
      anchorCount: 65,
      multipleOfUS: 7.4,
    },
  },
  {
    type: "Feature",
    id: "b",
    geometry: { type: "Point", coordinates: [-86, 39] },
    properties: {
      geoid: "b",
      name: "Indianapolis",
      state: "IN",
      states: ["IN"],
      tier: 2,
      asianIndian: 29_000,
      anchorCount: 0,
      multipleOfUS: 3.4,
    },
  },
  {
    type: "Feature",
    id: "c",
    geometry: { type: "Point", coordinates: [-100, 35] },
    properties: {
      geoid: "c",
      name: "Audit Market",
      state: "TX",
      states: ["TX"],
      tier: 4,
      asianIndian: 4_000,
      anchorCount: 2,
      multipleOfUS: 4.1,
    },
  },
];

const collection = { type: "FeatureCollection", features } as const;

const mixedHiddenCollection = {
  type: "FeatureCollection",
  features: [
    features[1],
    {
      type: "Feature",
      id: "d",
      geometry: { type: "Point", coordinates: [-97, 32] },
      properties: {
        geoid: "d",
        name: "Discovery Market",
        state: "TX",
        states: ["TX"],
        tier: 3,
        asianIndian: 4_000,
        anchorCount: 1,
        multipleOfUS: 3.1,
      },
    },
  ],
} as const;

const surpriseCollection = {
  type: "FeatureCollection",
  features: [
    ...Array.from({ length: 10 }, (_value, index) => ({
      type: "Feature" as const,
      id: `top-${index}`,
      geometry: { type: "Point" as const, coordinates: [-100 + index, 35] as [number, number] },
      properties: {
        geoid: `top-${index}`,
        name: `Top Metro ${index}`,
        state: "CA",
        states: ["CA"],
        tier: 1,
        asianIndian: 250_000 - index,
        anchorCount: 10,
        multipleOfUS: 4,
      },
    })),
    features[1],
  ],
};

describe("map filtering", () => {
  it("defaults the population floor to zero so tiers carry the launch filter", () => {
    expect(defaultMarketFilters().minAsianIndian).toBe(0);
  });

  it("hides tier 4 until audit inventory is enabled", () => {
    expect(filterMarketFeatures(collection, defaultMarketFilters()).map((f) => f.id)).toEqual([
      "a",
      "b",
    ]);

    expect(
      filterMarketFeatures(collection, {
        ...defaultMarketFilters(),
        tiers: [4],
        showAuditInventory: true,
        minAsianIndian: 0,
      }).map((f) => f.id),
    ).toEqual(["c"]);
  });

  it("applies state, population, and surprise-pockets filters", () => {
    expect(
      filterMarketFeatures(collection, {
        ...defaultMarketFilters(),
        state: "IN",
      }).map((f) => f.id),
    ).toEqual(["b"]);

    expect(
      filterMarketFeatures(collection, {
        ...defaultMarketFilters(),
        minAsianIndian: 100_000,
      }).map((f) => f.id),
    ).toEqual(["a"]);

    expect(
      filterMarketFeatures(surpriseCollection, {
        ...defaultMarketFilters(),
        surprisePockets: true,
      }).map((f) => f.id),
    ).toEqual(["b"]);
  });

  it("summarizes artifact-backed map KPIs", () => {
    expect(
      marketMapKpis({
        markets: collection,
        release: "ACS 2024 5-year",
      }),
    ).toEqual([
      { label: "Launch-planning markets", value: "1", detail: "Tier 1 evidence set" },
      { label: "Markets tracked", value: "3", detail: "ACS CBSAs in scope" },
      { label: "AI population covered", value: "235K", detail: "Asian Indian estimate" },
      { label: "Community anchors", value: "67", detail: "mapped evidence rows" },
      { label: "Data release", value: "ACS 2024", detail: "5-year CBSA table" },
    ]);
  });

  it("does not call tracked markets qualified when discovery tiers are included", () => {
    const kpis = marketMapKpis({
      markets: collection,
      release: "ACS 2024 5-year",
    });

    expect(kpis.map((kpi) => kpi.label.toLowerCase())).not.toContain("qualified markets");
    expect(kpis).toContainEqual({
      label: "Launch-planning markets",
      value: "1",
      detail: "Tier 1 evidence set",
    });
    expect(kpis).toContainEqual({
      label: "Markets tracked",
      value: "3",
      detail: "ACS CBSAs in scope",
    });
  });

  it("reports selected-tier members hidden only by the population slider", () => {
    const notice = hiddenPopulationNotice(collection, {
      ...defaultMarketFilters(),
      tiers: [2],
      minAsianIndian: 50_000,
    });

    expect(notice).toEqual({
      count: 1,
      message: "1 growth market hidden by the population filter.",
    });
  });

  it("generalizes hidden population feedback across selected tiers", () => {
    const notice = hiddenPopulationNotice(mixedHiddenCollection, {
      ...defaultMarketFilters(),
      tiers: [2, 3],
      minAsianIndian: 50_000,
    });

    expect(notice).toEqual({
      count: 2,
      message: "2 markets in selected tiers hidden by the population filter.",
    });

    const stateScopedNotice = hiddenPopulationNotice(collection, {
      ...defaultMarketFilters(),
      state: "TX",
      minAsianIndian: 100_000,
    });

    expect(stateScopedNotice).toBeUndefined();
  });
});
