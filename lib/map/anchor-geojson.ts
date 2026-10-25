type AnchorKind = "temple" | "grocery" | "cricket" | "theater";

type Anchor = {
  id: string;
  kind: string;
  lat: number;
  lng: number;
  marketGeoid: string;
  name: string;
  osmUrl: string;
};

type Rollup = {
  temples: number;
  groceries: number;
  cricket: number;
  theaters: number;
};

type AnchorsArtifact = {
  data: {
    sweptMarkets?: string[];
    marketRollups?: Record<string, Rollup>;
    anchors: Anchor[];
  };
};

function rollupCount(rollup: Rollup) {
  return rollup.temples + rollup.groceries + rollup.cricket + rollup.theaters;
}

export function buildAnchorFeatureCollection(anchorsArtifact: AnchorsArtifact) {
  return {
    type: "FeatureCollection" as const,
    features: anchorsArtifact.data.anchors.map((anchor) => ({
      type: "Feature" as const,
      id: anchor.id,
      geometry: {
        type: "Point" as const,
        coordinates: [anchor.lng, anchor.lat] as [number, number],
      },
      properties: {
        id: anchor.id,
        kind: anchor.kind as AnchorKind,
        marketGeoid: anchor.marketGeoid,
        name: anchor.name,
        osmUrl: anchor.osmUrl,
      },
    })),
  };
}

export function assertSweptRollupsMatchAnchorFeatures(anchorsArtifact: AnchorsArtifact) {
  const sweptMarkets = anchorsArtifact.data.sweptMarkets ?? [];
  const featureCounts = new Map<string, number>();

  for (const anchor of anchorsArtifact.data.anchors) {
    featureCounts.set(anchor.marketGeoid, (featureCounts.get(anchor.marketGeoid) ?? 0) + 1);
  }

  for (const marketGeoid of sweptMarkets) {
    const rollup = anchorsArtifact.data.marketRollups?.[marketGeoid];
    const expected = rollup ? rollupCount(rollup) : 0;
    const actual = featureCounts.get(marketGeoid) ?? 0;

    if (expected !== actual) {
      throw new Error(
        `${marketGeoid} rollup count ${expected} does not match ${actual} anchor features`,
      );
    }
  }
}
