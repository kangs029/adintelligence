import anchorsArtifact from "@/data/artifacts/anchors.json";
import cinemaArtifact from "@/data/artifacts/cinema.json";
import marketsArtifact from "@/data/artifacts/markets.json";
import { buildMarketDrawerModel } from "@/components/map/market-details";
import { buildAnchorFeatureCollection } from "@/lib/map/anchor-geojson";
import type { AnchorsGeoJson } from "@/components/map/MapCanvas";

export const revalidate = 86400;

type RouteContext = {
  params: Promise<{ geoid: string }>;
};

const anchorLayerGeoJson = buildAnchorFeatureCollection(anchorsArtifact) as AnchorsGeoJson;

function selectedAnchorGeoJson(geoid: string): AnchorsGeoJson {
  return {
    type: "FeatureCollection",
    features: anchorLayerGeoJson.features.filter(
      (feature) => feature.properties.marketGeoid === geoid,
    ),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { geoid } = await context.params;
  const market = marketsArtifact.data.markets.find((candidate) => candidate.geoid === geoid);

  if (!market) {
    return Response.json({ error: "Market not found" }, { status: 404 });
  }

  return Response.json(
    {
      anchors: selectedAnchorGeoJson(geoid),
      detail: {
        market,
        ...buildMarketDrawerModel({
          market,
          anchorsArtifact,
          cinemaArtifact,
          benchmarkMarkets: marketsArtifact.data.markets,
        }),
      },
    },
    {
      headers: {
        "cache-control": "s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
