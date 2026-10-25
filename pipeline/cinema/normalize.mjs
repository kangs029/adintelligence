function todayGeneratedAt() {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

function sanitizeText(value) {
  return String(value ?? "").replace(/[\u2013\u2014]/gu, "-");
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  return value;
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1);
}

function compactReleaseSource(source) {
  return sanitizeValue({
    id: source.id,
    movieTitle: source.movieTitle,
    releaseDate: source.releaseDate,
    primaryLanguage: source.primaryLanguage,
    versions: source.versions ?? [],
    sourceUrl: source.sourceUrl,
    sourceLabel: source.sourceLabel,
    sourceType: source.sourceType,
    sourceQuality: source.sourceQuality,
    coverageStatus: source.coverageStatus,
    caveat: source.caveat,
  });
}

function compactCitySummary(summary) {
  return sanitizeValue({
    key: summary.key,
    country: summary.country,
    regionCode: summary.regionCode,
    regionName: summary.regionName,
    city: summary.city,
    rowCount: summary.rowCount,
    movieCount: summary.movieCount,
    theaterCount: summary.theaterCount,
    languages: summary.languages ?? [],
    movies: (summary.movies ?? []).map((movie) => ({
      movieId: movie.movieId,
      rowCount: movie.rowCount,
      theaterCount: movie.theaterCount,
      languages: movie.languages ?? [],
    })),
    theaters: (summary.theaters ?? []).map((theater) => ({
      theaterName: theater.theaterName,
      chain: theater.chain,
    })),
  });
}

function compactTheaterSignal(signal) {
  return sanitizeValue({
    id: signal.id,
    movieTitle: signal.movieTitle,
    language: signal.language,
    signalDate: signal.signalDate,
    sourceType: signal.sourceType,
    sourceQuality: signal.sourceQuality,
    theaterName: signal.theaterName,
    chain: signal.chain,
    city: signal.city,
    state: signal.state,
    sourceUrl: signal.sourceUrl,
    sourceCapturedAt: signal.sourceCapturedAt,
    joinedMarketRef: signal.joinedMarketRef,
    joinedMarketName: signal.joinedMarketName,
    matchConfidence: signal.matchConfidence,
    note: signal.note,
  });
}

export function normalizeCinemaV1Snapshot({ blockbusterMarkets, pushpa2, pulse }) {
  return {
    capturedAt: latestDate([blockbusterMarkets?.asOf, pushpa2?.asOf, pulse?.asOf]),
    sources: [
      sanitizeValue({
        id: "cinema-blockbuster-markets",
        capturedAt: blockbusterMarkets?.asOf,
        description: blockbusterMarkets?.description,
        counts: blockbusterMarkets?.counts,
        releaseSources: (blockbusterMarkets?.releaseSources ?? []).map(compactReleaseSource),
      }),
      sanitizeValue({
        id: "cinema-pushpa2-theaters",
        capturedAt: pushpa2?.asOf,
        movieTitle: pushpa2?.movieTitle,
        releaseDate: pushpa2?.releaseDate,
        counts: pushpa2?.counts,
        sourceChecks: pushpa2?.sourceChecks ?? [],
      }),
      sanitizeValue({
        id: "cinema-pulse-baselines",
        capturedAt: pulse?.asOf,
        movieSignalCount: pulse?.movieSignals?.length ?? 0,
        theaterSignalCount: pulse?.theaterSignals?.length ?? 0,
        sourceChecks: pulse?.sourceChecks ?? [],
      }),
    ],
    citySummaries: (blockbusterMarkets?.citySummaries ?? [])
      .filter((summary) => summary.country === "USA")
      .map(compactCitySummary),
    theaterSignals: (pulse?.theaterSignals ?? []).map(compactTheaterSignal),
  };
}

export function normalizeCinemaSeeds(seeds) {
  return seeds
    .map((seed) => ({
      release: seed.release,
      publishedAt: seed.publishedAt,
      capturedAt: seed.capturedAt,
      theaters: (seed.theaters ?? [])
        .map((theater) => ({
          name: theater.name,
          marketGeoid: theater.marketGeoid,
          lat: theater.lat,
          lng: theater.lng,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.release.localeCompare(right.release));
}

export function buildCinemaArtifact({
  footprints,
  snapshot,
  generatedAt = todayGeneratedAt(),
}) {
  return {
    meta: {
      family: "cinema",
      version: 1,
      generatedAt,
      provenance: "snapshot",
      source: "Ported v1 cinema release JSON",
      method: "Restamped v1 cinema footprint evidence with preserved source dates.",
      refreshCadence: "per major Indian film release",
      caveats: [
        "Cinema footprint proves community presence around releases, not remittance demand.",
        "Release-list and showtime rows do not prove attendance, ticket sales, or customer intent.",
      ],
    },
    data: snapshot ?? {
      footprints,
    },
  };
}
