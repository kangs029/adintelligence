function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

export function buildAnchorsArtifact({
  anchors,
  capturedAt,
  marketRollups,
  sweptMarkets,
  generatedAt = todayGeneratedAt(),
}) {
  return {
    meta: {
      family: "anchors",
      version: 1,
      generatedAt,
      provenance: "snapshot",
      source: "OpenStreetMap Overpass API",
      method: `Overpass anchor sweep normalized through reviewable QA rules; ${anchors.length} anchors included.`,
      refreshCadence: "monthly",
      caveats: [
        "OSM coverage varies by market.",
        "QA flags are review aids and not proof of venue ownership or affiliation.",
      ],
    },
    data: {
      capturedAt,
      anchors,
      ...(marketRollups ? { marketRollups } : {}),
      ...(sweptMarkets ? { sweptMarkets } : {}),
    },
  };
}
