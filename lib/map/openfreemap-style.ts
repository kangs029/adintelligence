import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

type StyleLayerWithSource = LayerSpecification & {
  "source-layer"?: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

const placeLayerTerms = /(^|[_-])(place|settlement|city|town|village|hamlet|locality|suburb)([_-]|$)/i;
const placeSourceLayerTerms = /^(place|settlement)$/i;
const dotIconTerms = /circle|dot|marker/i;

function layerSourceLayer(layer: StyleLayerWithSource) {
  return String(layer["source-layer"] ?? "");
}

function isPlaceOrSettlementLayer(layer: StyleLayerWithSource) {
  const sourceLayer = layerSourceLayer(layer);

  return placeSourceLayerTerms.test(sourceLayer) || placeLayerTerms.test(layer.id);
}

function containsDotIcon(value: unknown): boolean {
  if (typeof value === "string") {
    return dotIconTerms.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsDotIcon(item));
  }

  return false;
}

export function isOpenFreeMapPlaceDotCircleLayer(layer: LayerSpecification) {
  const styleLayer = layer as StyleLayerWithSource;

  return layer.type === "circle" && isPlaceOrSettlementLayer(styleLayer);
}

export function isOpenFreeMapPlaceDotSymbolLayer(layer: LayerSpecification) {
  const styleLayer = layer as StyleLayerWithSource;
  const iconImage = styleLayer.layout?.["icon-image"];

  return (
    layer.type === "symbol" &&
    isPlaceOrSettlementLayer(styleLayer) &&
    containsDotIcon(iconImage)
  );
}

function stripPlaceDotSymbolIcon(layer: LayerSpecification): LayerSpecification {
  if (!isOpenFreeMapPlaceDotSymbolLayer(layer)) {
    return layer;
  }

  const styleLayer = layer as StyleLayerWithSource;
  const layout: Record<string, unknown> = { ...(styleLayer.layout ?? {}) };
  const paint: Record<string, unknown> = { ...(styleLayer.paint ?? {}) };

  delete layout["icon-image"];
  delete layout["icon-size"];
  delete paint["icon-opacity"];

  return {
    ...styleLayer,
    layout,
    paint,
  } as LayerSpecification;
}

export function stripOpenFreeMapPlaceDots(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers
      .filter((layer) => !isOpenFreeMapPlaceDotCircleLayer(layer))
      .map(stripPlaceDotSymbolIcon),
  };
}
