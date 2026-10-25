import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import {
  isOpenFreeMapPlaceDotCircleLayer,
  isOpenFreeMapPlaceDotSymbolLayer,
  stripOpenFreeMapPlaceDots,
} from "./openfreemap-style";

const baseStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: "background", type: "background" },
    {
      id: "place_city",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: {
        "icon-image": ["step", ["zoom"], "circle-11", 9, ""],
        "icon-size": 0.4,
        "text-field": ["get", "name"],
      },
      paint: {
        "icon-opacity": 0.7,
        "text-color": "rgb(101,101,101)",
      },
    },
    {
      id: "place_city_text_only",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: {
        "text-field": ["get", "name"],
      },
      paint: {
        "text-color": "rgb(101,101,101)",
      },
    },
    {
      id: "future_settlement_dot",
      type: "circle",
      source: "openmaptiles",
      "source-layer": "settlement",
      paint: {
        "circle-radius": 3,
        "circle-color": "#555",
      },
    },
    {
      id: "airport_marker",
      type: "circle",
      source: "openmaptiles",
      "source-layer": "aeroway",
      paint: {
        "circle-radius": 3,
        "circle-color": "#555",
      },
    },
  ],
};

describe("OpenFreeMap style place-dot sanitizer", () => {
  it("recognizes current place symbol dot icons and future place circle layers", () => {
    const layers = baseStyle.layers;

    expect(isOpenFreeMapPlaceDotSymbolLayer(layers[1])).toBe(true);
    expect(isOpenFreeMapPlaceDotSymbolLayer(layers[2])).toBe(false);
    expect(isOpenFreeMapPlaceDotCircleLayer(layers[3])).toBe(true);
    expect(isOpenFreeMapPlaceDotCircleLayer(layers[4])).toBe(false);
  });

  it("strips place dot icons while preserving city text labels", () => {
    const quietStyle = stripOpenFreeMapPlaceDots(baseStyle);
    const cityLayer = quietStyle.layers.find((layer) => layer.id === "place_city");

    expect(quietStyle.layers.map((layer) => layer.id)).toEqual([
      "background",
      "place_city",
      "place_city_text_only",
      "airport_marker",
    ]);
    expect(cityLayer).toMatchObject({
      type: "symbol",
      layout: {
        "text-field": ["get", "name"],
      },
      paint: {
        "text-color": "rgb(101,101,101)",
      },
    });
    expect((cityLayer as { layout?: Record<string, unknown> }).layout?.["icon-image"]).toBeUndefined();
    expect((cityLayer as { layout?: Record<string, unknown> }).layout?.["icon-size"]).toBeUndefined();
    expect((cityLayer as { paint?: Record<string, unknown> }).paint?.["icon-opacity"]).toBeUndefined();
  });
});
