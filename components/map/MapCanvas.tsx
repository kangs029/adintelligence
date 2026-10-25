"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type CircleLayerSpecification,
  type GeoJSONSource,
  type Map,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import { ProvenanceChip } from "@/components/shell/ProvenanceChip";
import {
  MARKET_TIER_COLOR_EXPRESSION,
  MARKET_TIER_RADIUS_EXPRESSION,
  MARKET_TIER_STROKE_COLOR_EXPRESSION,
  MARKET_TIER_STROKE_WIDTH_EXPRESSION,
} from "@/lib/map/tier-colors";
import {
  isOpenFreeMapPlaceDotCircleLayer,
  isOpenFreeMapPlaceDotSymbolLayer,
  stripOpenFreeMapPlaceDots,
} from "@/lib/map/openfreemap-style";
import { MapLegend } from "./MapLegend";

const OPENFREEMAP_DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";
const MARKET_SOURCE_ID = "xpat-markets";
const MARKET_LAYER_ID = "xpat-market-dots";
const SELECTED_MARKET_LAYER_ID = "xpat-selected-market";
const ANCHOR_SOURCE_ID = "xpat-anchors";
const ANCHOR_LAYER_ID = "xpat-anchor-symbols";
const ANCHOR_PULSE_LAYER_ID = "xpat-anchor-pulse";
const anchorGlyphs = {
  temple: {
    label: "Temple",
    image: "xpat-anchor-temple",
    shape: "triangle",
    color: "#D6FFF9",
  },
  grocery: {
    label: "Indian Grocery",
    image: "xpat-anchor-grocery",
    shape: "circle",
    color: "#5EEAD4",
  },
  cricket: {
    label: "Cricket Ground",
    image: "xpat-anchor-cricket",
    shape: "diamond",
    color: "#F7D67A",
  },
  theater: {
    label: "Theater",
    image: "xpat-anchor-theater",
    shape: "square",
    color: "#C9CED6",
  },
} as const;
const DENSE_MARKET_OFFSETS: Record<string, [number, number]> = {
  "31000US14860": [0.12, 0.08],
  "31000US28880": [-0.12, 0.1],
  "31000US35300": [0.16, 0.06],
  "31000US45940": [0.14, -0.08],
  "31000US47930": [-0.1, 0.08],
};

const marketCirclePaint = {
  "circle-radius": MARKET_TIER_RADIUS_EXPRESSION,
  "circle-color": MARKET_TIER_COLOR_EXPRESSION,
  "circle-opacity": 0.92,
  "circle-stroke-color": MARKET_TIER_STROKE_COLOR_EXPRESSION,
  "circle-stroke-width": MARKET_TIER_STROKE_WIDTH_EXPRESSION,
} as CircleLayerSpecification["paint"];

type MarketFeatureProperties = {
  geoid: string;
  name: string;
  state: string;
  states: string[];
  tier: number;
  score: number;
  markerRadius: number;
  asianIndian: number;
  asianIndianMoe: number;
  localSharePct: number;
  multipleOfUS: number;
  moeReliability: string;
  anchorCount: number;
  templeCount: number;
  groceryCount: number;
  cricketCount: number;
  theaterCount: number;
  anchorsPer10kAI: number;
  lcaFilings: number;
  activeIndianStudents: number;
};

export type MarketsGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: MarketFeatureProperties;
  }>;
};

export type AnchorsGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: string;
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      id: string;
      kind: "temple" | "grocery" | "cricket" | "theater";
      marketGeoid: string;
      name: string;
      osmUrl: string;
    };
  }>;
};

type TooltipState = {
  x: number;
  y: number;
} & (
  | {
      type: "market";
      market: MarketFeatureProperties;
    }
  | {
      type: "anchor";
      anchor: AnchorFeatureProperties;
    }
);

type AnchorFeatureProperties = AnchorsGeoJson["features"][number]["properties"];
type AnchorKind = AnchorFeatureProperties["kind"];
type AnchorFocusTarget = {
  id: string;
  lat: number;
  lng: number;
  name: string;
};

type XpatMapDebug = {
  anchorPoints: Array<{
    id: string;
    kind: AnchorKind;
    lat: number;
    lng: number;
    name: string;
    x: number;
    y: number;
  }>;
  basemapPlaceDotLayerIds: string[];
  center: { lat: number; lng: number; zoom: number };
  focusedAnchorId?: string;
  visibleMarketCount: number;
};

declare global {
  interface Window {
    __xpatMapDebug?: XpatMapDebug;
  }
}

type MapFilter = Parameters<Map["setFilter"]>[1];
type LayerFilter = NonNullable<MapFilter>;

const emptyAnchorCollection: AnchorsGeoJson = {
  type: "FeatureCollection",
  features: [],
};

interface MapCanvasProps {
  anchorKinds?: string[];
  anchors?: AnchorsGeoJson;
  focusedAnchor?: AnchorFocusTarget;
  markets: MarketsGeoJson;
  onSelectMarket?: (geoid: string) => void;
  selectedGeoid?: string;
  visibleGeoids?: string[];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function tierLabel(tier: number) {
  if (tier === 1) return "Tier 1 · Launch planning";
  if (tier === 2) return "Tier 2 · Growth";
  if (tier === 3) return "Tier 3 · Discovery";
  return "Tier 4 · Audit hold";
}

function featureProperties(event: MapLayerMouseEvent): MarketFeatureProperties | undefined {
  const feature = event.features?.[0];
  return feature?.properties as MarketFeatureProperties | undefined;
}

function anchorProperties(event: MapLayerMouseEvent): AnchorFeatureProperties | undefined {
  const feature = event.features?.[0];
  return feature?.properties as AnchorFeatureProperties | undefined;
}

function applyMarketFilter(map: Map, visibleGeoids?: string[]) {
  if (!map.getLayer(MARKET_LAYER_ID)) return;
  if (!visibleGeoids) {
    map.setFilter(MARKET_LAYER_ID, undefined);
    return;
  }

  map.setFilter(MARKET_LAYER_ID, [
    "in",
    ["get", "geoid"],
    ["literal", visibleGeoids],
  ] as MapFilter);
}

function displayMarkets(markets: MarketsGeoJson): MarketsGeoJson {
  return {
    ...markets,
    features: markets.features.map((feature) => {
      const offset = DENSE_MARKET_OFFSETS[feature.properties.geoid];
      if (!offset) {
        return feature;
      }

      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: [
            feature.geometry.coordinates[0] + offset[0],
            feature.geometry.coordinates[1] + offset[1],
          ],
        },
      };
    }),
  };
}

const anchorKindMap: Record<string, string> = {
  temples: "temple",
  groceries: "grocery",
  cricket: "cricket",
  theaters: "theater",
};

function anchorLayerFilter(selectedGeoid?: string, anchorKinds: string[] = []): LayerFilter {
  if (!selectedGeoid || anchorKinds.length === 0) {
    return ["==", ["get", "marketGeoid"], "__none__"] as LayerFilter;
  }

  return [
    "all",
    ["==", ["get", "marketGeoid"], selectedGeoid],
    [
      "in",
      ["get", "kind"],
      ["literal", anchorKinds.map((kind) => anchorKindMap[kind] ?? kind)],
    ],
  ] as LayerFilter;
}

function selectedAnchorKinds(anchorKinds: string[] = []) {
  return new Set(anchorKinds.map((kind) => anchorKindMap[kind] ?? kind));
}

function anchorFeaturesForDebug({
  anchors,
  anchorKinds,
  selectedGeoid,
}: {
  anchors?: AnchorsGeoJson;
  anchorKinds?: string[];
  selectedGeoid?: string;
}) {
  if (!anchors || !selectedGeoid) return [];

  const kinds = selectedAnchorKinds(anchorKinds);
  if (kinds.size === 0) return [];

  return anchors.features.filter((feature) => {
    const properties = feature.properties;
    return properties.marketGeoid === selectedGeoid && kinds.has(properties.kind);
  });
}

function syncMapDebug({
  anchors,
  anchorKinds,
  focusedAnchor,
  map,
  selectedGeoid,
  visibleGeoids,
}: {
  anchors?: AnchorsGeoJson;
  anchorKinds?: string[];
  focusedAnchor?: AnchorFocusTarget;
  map: Map;
  selectedGeoid?: string;
  visibleGeoids?: string[];
}) {
  const center = map.getCenter();

  window.__xpatMapDebug = {
    anchorPoints: anchorFeaturesForDebug({ anchors, anchorKinds, selectedGeoid }).map(
      (feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const point = map.project([lng, lat]);
        return {
          id: feature.properties.id,
          kind: feature.properties.kind,
          lat,
          lng,
          name: feature.properties.name,
          x: point.x,
          y: point.y,
        };
      },
    ),
    basemapPlaceDotLayerIds: map
      .getStyle()
      .layers.filter(
        (layer) =>
          isOpenFreeMapPlaceDotCircleLayer(layer) ||
          isOpenFreeMapPlaceDotSymbolLayer(layer),
      )
      .map((layer) => layer.id),
    center: {
      lat: center.lat,
      lng: center.lng,
      zoom: map.getZoom(),
    },
    focusedAnchorId: focusedAnchor?.id,
    visibleMarketCount: visibleGeoids?.length ?? 0,
  };
}

function focusMarket({
  map,
  markets,
  selectedGeoid,
}: {
  map: Map;
  markets: MarketsGeoJson;
  selectedGeoid?: string;
}) {
  const selectedFeature = markets.features.find(
    (feature) => feature.properties.geoid === selectedGeoid,
  );
  if (!selectedFeature) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const center = selectedFeature.geometry.coordinates;
  const camera = { center, zoom: Math.max(map.getZoom(), 8) };

  if (prefersReducedMotion) {
    map.jumpTo(camera);
  } else {
    map.flyTo({ ...camera, duration: 800, essential: true });
  }
}

function applySelectedFilters({
  map,
  selectedGeoid,
  anchorKinds,
}: {
  map: Map;
  selectedGeoid?: string;
  anchorKinds?: string[];
}) {
  if (map.getLayer(SELECTED_MARKET_LAYER_ID)) {
    map.setFilter(
      SELECTED_MARKET_LAYER_ID,
      selectedGeoid
        ? (["==", ["get", "geoid"], selectedGeoid] as MapFilter)
        : (["==", ["get", "geoid"], "__none__"] as MapFilter),
    );
  }

  if (map.getLayer(ANCHOR_LAYER_ID)) {
    map.setFilter(ANCHOR_LAYER_ID, anchorLayerFilter(selectedGeoid, anchorKinds));
  }
}

function applyAnchorData(map: Map, anchors?: AnchorsGeoJson) {
  const source = map.getSource(ANCHOR_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(anchors ?? emptyAnchorCollection);
}

function glyphImageForKind(kind: AnchorKind) {
  return anchorGlyphs[kind].image;
}

function addAnchorGlyphImage(map: Map, kind: AnchorKind) {
  const glyph = anchorGlyphs[kind];
  if (map.hasImage(glyph.image)) {
    return;
  }

  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.lineWidth = 3;
  context.lineJoin = "round";
  context.strokeStyle = "#06100F";
  context.fillStyle = glyph.color;

  const inset = 5.5;
  const center = size / 2;
  context.beginPath();
  if (glyph.shape === "triangle") {
    context.moveTo(center, inset);
    context.lineTo(size - inset, size - inset);
    context.lineTo(inset, size - inset);
    context.closePath();
  } else if (glyph.shape === "circle") {
    context.arc(center, center, 8, 0, Math.PI * 2);
  } else if (glyph.shape === "diamond") {
    context.moveTo(center, inset);
    context.lineTo(size - inset, center);
    context.lineTo(center, size - inset);
    context.lineTo(inset, center);
    context.closePath();
  } else {
    context.rect(inset, inset, size - inset * 2, size - inset * 2);
  }

  context.fill();
  context.stroke();
  map.addImage(glyph.image, context.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

function addAnchorGlyphImages(map: Map) {
  (Object.keys(anchorGlyphs) as AnchorKind[]).forEach((kind) =>
    addAnchorGlyphImage(map, kind),
  );
}

function addFallbackSpriteImage(map: Map, id: string) {
  if (map.hasImage(id)) {
    return;
  }

  const size = 22;
  const center = (size - 1) / 2;
  const radius = 7;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const distance = Math.hypot(x - center, y - center);
      const isStroke = distance <= radius + 1.5 && distance > radius - 1.5;
      const isFill = distance <= radius - 1.5;

      if (isStroke || isFill) {
        data[index] = isStroke ? 214 : 94;
        data[index + 1] = isStroke ? 255 : 234;
        data[index + 2] = isStroke ? 249 : 212;
        data[index + 3] = isStroke ? 230 : 210;
      }
    }
  }

  map.addImage(id, { width: size, height: size, data }, { pixelRatio: 2 });
}

function isIgnorableMapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");

  return /abort|aborted|cancelled|canceled|tile request/i.test(message);
}

async function loadQuietOpenFreeMapStyle(signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(OPENFREEMAP_DARK_STYLE, { signal });

  if (!response.ok) {
    throw new Error(`OpenFreeMap style request failed with ${response.status}`);
  }

  const style = (await response.json()) as StyleSpecification & { glyphs?: string };
  delete style.glyphs;
  return stripOpenFreeMapPlaceDots(style);
}

export function MapCanvas({
  anchorKinds,
  anchors,
  focusedAnchor,
  markets,
  onSelectMarket,
  selectedGeoid,
  visibleGeoids,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const onSelectRef = useRef(onSelectMarket);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [failed, setFailed] = useState(false);
  const visibleGeoidsRef = useRef<string[] | undefined>(undefined);
  const selectedGeoidRef = useRef<string | undefined>(undefined);
  const anchorKindsRef = useRef<string[] | undefined>(undefined);
  const anchorsRef = useRef<AnchorsGeoJson | undefined>(anchors);
  const focusedAnchorRef = useRef<AnchorFocusTarget | undefined>(undefined);
  const pulseAnimationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    onSelectRef.current = onSelectMarket;
  }, [onSelectMarket]);

  useEffect(() => {
    focusedAnchorRef.current = focusedAnchor;
  }, [focusedAnchor]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const controller = new AbortController();
    let disposed = false;
    let activeMap: Map | null = null;

    loadQuietOpenFreeMapStyle(controller.signal)
      .then((style) => {
        if (!containerRef.current || disposed) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          bounds: [
            [-125.5, 24.2],
            [-66.5, 49.5],
          ],
          fitBoundsOptions: { padding: 36 },
          attributionControl: false,
        });

        activeMap = map;
        mapRef.current = map;
        map.on("styleimagemissing", (event: { id?: string }) => {
          if (event.id === "circle-11") {
            addFallbackSpriteImage(map, event.id);
          }
        });
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: "OpenFreeMap · OpenStreetMap",
          }),
        );

        map.on("load", () => {
          addAnchorGlyphImages(map);
          map.addSource(MARKET_SOURCE_ID, {
            type: "geojson",
            data: displayMarkets(markets),
          });
          map.addLayer({
            id: MARKET_LAYER_ID,
            type: "circle",
            source: MARKET_SOURCE_ID,
            paint: marketCirclePaint,
          });
          map.addLayer({
            id: SELECTED_MARKET_LAYER_ID,
            type: "circle",
            source: MARKET_SOURCE_ID,
            filter: ["==", ["get", "geoid"], "__none__"],
            paint: {
              "circle-radius": ["+", ["get", "markerRadius"], 4],
              "circle-color": "rgba(0,0,0,0)",
              "circle-stroke-color": "#F2F3F5",
              "circle-stroke-width": 2,
            },
          });
          map.addSource(ANCHOR_SOURCE_ID, {
            type: "geojson",
            data: anchorsRef.current ?? emptyAnchorCollection,
          });
          map.addLayer({
            id: ANCHOR_PULSE_LAYER_ID,
            type: "circle",
            source: ANCHOR_SOURCE_ID,
            filter: ["==", ["get", "id"], "__none__"],
            paint: {
              "circle-radius": 0,
              "circle-color": "rgba(45, 212, 191, 0)",
              "circle-opacity": 0,
              "circle-stroke-color": "#D6FFF9",
              "circle-stroke-width": 1.5,
            },
          });
          map.addLayer({
            id: ANCHOR_LAYER_ID,
            type: "symbol",
            source: ANCHOR_SOURCE_ID,
            filter: anchorLayerFilter(selectedGeoidRef.current, anchorKindsRef.current),
            layout: {
              "icon-image": [
                "match",
                ["get", "kind"],
                "temple",
                glyphImageForKind("temple"),
                "grocery",
                glyphImageForKind("grocery"),
                "cricket",
                glyphImageForKind("cricket"),
                glyphImageForKind("theater"),
              ],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "symbol-sort-key": [
                "match",
                ["get", "kind"],
                "temple",
                4,
                "grocery",
                3,
                "cricket",
                2,
                1,
              ],
            },
          });
          applyMarketFilter(map, visibleGeoidsRef.current);
          applySelectedFilters({
            map,
            selectedGeoid: selectedGeoidRef.current,
            anchorKinds: anchorKindsRef.current,
          });
          focusMarket({
            map,
            markets,
            selectedGeoid: selectedGeoidRef.current,
          });
          syncMapDebug({
            anchors: anchorsRef.current,
            anchorKinds: anchorKindsRef.current,
            focusedAnchor: focusedAnchorRef.current,
            map,
            selectedGeoid: selectedGeoidRef.current,
            visibleGeoids: visibleGeoidsRef.current,
          });
        });

        map.on("error", (event) => {
          if (isIgnorableMapError(event.error)) {
            return;
          }
          setFailed(true);
        });
        map.on("mouseenter", MARKET_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", MARKET_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          setTooltip(null);
        });
        map.on("mousemove", MARKET_LAYER_ID, (event) => {
          const market = featureProperties(event);
          if (!market) return;
          setTooltip({
            x: event.point.x,
            y: event.point.y,
            type: "market",
            market,
          });
        });
        map.on("click", MARKET_LAYER_ID, (event) => {
          const market = featureProperties(event);
          if (market) {
            onSelectRef.current?.(market.geoid);
          }
        });
        map.on("mouseenter", ANCHOR_LAYER_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", ANCHOR_LAYER_ID, () => {
          map.getCanvas().style.cursor = "";
          setTooltip(null);
        });
        map.on("mousemove", ANCHOR_LAYER_ID, (event) => {
          const anchor = anchorProperties(event);
          if (!anchor) return;
          setTooltip({
            x: event.point.x,
            y: event.point.y,
            type: "anchor",
            anchor,
          });
        });
        map.on("click", ANCHOR_LAYER_ID, (event) => {
          const anchor = anchorProperties(event);
          if (!anchor) return;
          window.open(anchor.osmUrl, "_blank", "noopener,noreferrer");
        });
        map.on("moveend", () => {
          syncMapDebug({
            anchors: anchorsRef.current,
            anchorKinds: anchorKindsRef.current,
            focusedAnchor: focusedAnchorRef.current,
            map,
            selectedGeoid: selectedGeoidRef.current,
            visibleGeoids: visibleGeoidsRef.current,
          });
        });
      })
      .catch((error: unknown) => {
        if (!disposed && !isIgnorableMapError(error)) {
          setFailed(true);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
      }
      activeMap?.remove();
      mapRef.current = null;
      delete window.__xpatMapDebug;
    };
  }, [markets]);

  useEffect(() => {
    visibleGeoidsRef.current = visibleGeoids;
    if (mapRef.current) {
      applyMarketFilter(mapRef.current, visibleGeoids);
      syncMapDebug({
        anchors,
        anchorKinds: anchorKindsRef.current,
        focusedAnchor: focusedAnchorRef.current,
        map: mapRef.current,
        selectedGeoid: selectedGeoidRef.current,
        visibleGeoids,
      });
    }
  }, [anchors, visibleGeoids]);

  useEffect(() => {
    anchorsRef.current = anchors;
    if (!mapRef.current) return;

    applyAnchorData(mapRef.current, anchors);
    syncMapDebug({
      anchors,
      anchorKinds: anchorKindsRef.current,
      focusedAnchor: focusedAnchorRef.current,
      map: mapRef.current,
      selectedGeoid: selectedGeoidRef.current,
      visibleGeoids: visibleGeoidsRef.current,
    });
  }, [anchors]);

  useEffect(() => {
    selectedGeoidRef.current = selectedGeoid;
    anchorKindsRef.current = anchorKinds;
    const map = mapRef.current;
    if (!map) return;

    applySelectedFilters({ map, selectedGeoid, anchorKinds });
    syncMapDebug({
      anchors,
      anchorKinds,
      focusedAnchor: focusedAnchorRef.current,
      map,
      selectedGeoid,
      visibleGeoids: visibleGeoidsRef.current,
    });

    focusMarket({ map, markets, selectedGeoid });
  }, [anchorKinds, anchors, markets, selectedGeoid]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedAnchor) return;

    focusedAnchorRef.current = focusedAnchor;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const center: [number, number] = [focusedAnchor.lng, focusedAnchor.lat];
    const camera = { center, zoom: Math.max(map.getZoom(), 11) };

    if (prefersReducedMotion) {
      map.jumpTo(camera);
    } else {
      map.flyTo({ ...camera, duration: 800, essential: true });
    }

    if (map.getLayer(ANCHOR_PULSE_LAYER_ID)) {
      map.setFilter(ANCHOR_PULSE_LAYER_ID, [
        "==",
        ["get", "id"],
        focusedAnchor.id,
      ] as MapFilter);
      map.setPaintProperty(ANCHOR_PULSE_LAYER_ID, "circle-opacity", 0.8);
      map.setPaintProperty(ANCHOR_PULSE_LAYER_ID, "circle-radius", 9);

      if (pulseAnimationRef.current) {
        cancelAnimationFrame(pulseAnimationRef.current);
      }

      if (!prefersReducedMotion) {
        const startedAt = performance.now();
        const animatePulse = (timestamp: number) => {
          const elapsed = timestamp - startedAt;
          const progress = Math.min(elapsed / 900, 1);
          map.setPaintProperty(
            ANCHOR_PULSE_LAYER_ID,
            "circle-radius",
            8 + progress * 12,
          );
          map.setPaintProperty(
            ANCHOR_PULSE_LAYER_ID,
            "circle-opacity",
            Math.max(0, 0.8 * (1 - progress)),
          );

          if (progress < 1) {
            pulseAnimationRef.current = requestAnimationFrame(animatePulse);
          }
        };

        pulseAnimationRef.current = requestAnimationFrame(animatePulse);
      }
    }

    syncMapDebug({
      anchors,
      anchorKinds: anchorKindsRef.current,
      focusedAnchor,
      map,
      selectedGeoid: selectedGeoidRef.current,
      visibleGeoids: visibleGeoidsRef.current,
    });
  }, [anchors, focusedAnchor]);

  if (failed) {
    return (
      <section className="map-fallback" aria-labelledby="map-fallback-title">
        <h2 id="map-fallback-title">Map tiles unavailable</h2>
        <p>Showing the ranked market list from grounded artifacts.</p>
        <ol>
          {markets.features.slice(0, 8).map((feature) => (
            <li key={feature.id}>
              <span>{feature.properties.name}</span>
              <strong>{tierLabel(feature.properties.tier)}</strong>
            </li>
          ))}
        </ol>
        <button className="btn" type="button" onClick={() => window.location.reload()}>
          Retry map
        </button>
      </section>
    );
  }

  return (
    <section className="map-stage" aria-label="Interactive market map">
      <div ref={containerRef} className="maplibre-host" data-testid="market-map" />
      <div className="map-provenance-note">
        <ProvenanceChip provenance="grounded" release="ACS 2024 5yr" />
      </div>
      <MapLegend />
      {selectedGeoid ? (
        <div className="anchor-mini-legend" aria-label="Selected market anchor legend">
          <div className="anchor-mini-legend-copy">
            Anchors are community places: temples, Indian groceries, cricket grounds,
            theaters.
          </div>
          {(Object.keys(anchorGlyphs) as AnchorKind[]).map((kind) => (
            <div className="anchor-mini-legend-row" key={kind}>
              <span
                className={`anchor-glyph anchor-glyph-${anchorGlyphs[kind].shape}`}
                style={{ backgroundColor: anchorGlyphs[kind].color }}
                aria-hidden="true"
              />
              {anchorGlyphs[kind].label}
            </div>
          ))}
        </div>
      ) : null}
      {tooltip ? (
        <div
          className="map-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
          role="status"
        >
          {tooltip.type === "market" ? (
            <>
              <strong>{tooltip.market.name}</strong>
              <span>{tierLabel(tooltip.market.tier)}</span>
              <span>
                <b>{formatNumber(tooltip.market.asianIndian)}</b> Asian Indian ·{" "}
                <b>{tooltip.market.multipleOfUS.toFixed(1)}×</b> US share
              </span>
            </>
          ) : (
            <>
              <strong>{tooltip.anchor.name}</strong>
              <span>{anchorGlyphs[tooltip.anchor.kind].label}</span>
              <span>OSM source, click to open</span>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
