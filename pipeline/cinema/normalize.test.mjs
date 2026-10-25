import { describe, expect, it } from "vitest";

import {
  buildCinemaArtifact,
  normalizeCinemaSeeds,
  normalizeCinemaV1Snapshot,
} from "./normalize.mjs";

describe("cinema normalization", () => {
  it("ports v1 cinema seed JSON while preserving release and capture dates", () => {
    expect(
      normalizeCinemaSeeds([
        {
          release: "Pushpa 2",
          publishedAt: "2024-12-05",
          capturedAt: "2024-12-07T12:00:00.000Z",
          theaters: [
            {
              name: "Cinemark Century Great Mall",
              marketGeoid: "31000US41940",
              lat: 37.414,
              lng: -121.897,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        release: "Pushpa 2",
        publishedAt: "2024-12-05",
        capturedAt: "2024-12-07T12:00:00.000Z",
        theaters: [
          {
            name: "Cinemark Century Great Mall",
            marketGeoid: "31000US41940",
            lat: 37.414,
            lng: -121.897,
          },
        ],
      },
    ]);
  });

  it("stamps cinema as cultural corroboration, not remittance demand", () => {
    const artifact = buildCinemaArtifact({
      generatedAt: "2026-07-02T00:00:00.000Z",
      footprints: [],
    });

    expect(artifact.meta).toMatchObject({
      family: "cinema",
      provenance: "snapshot",
      source: "Ported v1 cinema release JSON",
    });
    expect(artifact.meta.caveats).toContain(
      "Cinema footprint proves community presence around releases, not remittance demand.",
    );
  });

  it("ports compact v1 cinema snapshots and normalizes typography for copy guardrails", () => {
    const snapshot = normalizeCinemaV1Snapshot({
      blockbusterMarkets: {
        asOf: "2026-06-20",
        description: "Release-list coverage",
        counts: { movies: 1, rows: 2 },
        releaseSources: [
          {
            id: "jawan",
            movieTitle: "Jawan",
            releaseDate: "2023-09-07",
            sourceUrl: "https://example.com/jawan",
            sourceLabel: "Archived sheet",
            sourceType: "archived-distributor-sheet",
            sourceQuality: "distributor-public-list",
            coverageStatus: "near-full-usa",
            caveat: "Release-list footprint, not attendance.",
          },
        ],
        citySummaries: [
          {
            key: "USA:IL:moline",
            country: "USA",
            regionCode: "IL",
            city: "Moline",
            rowCount: 2,
            movieCount: 1,
            theaterCount: 1,
            languages: ["Hindi"],
            movies: [{ movieId: "jawan", rowCount: 2, theaterCount: 1, languages: ["Hindi"] }],
            theaters: [{ theaterName: "Moline IL-IA 10", chain: "Fixture" }],
          },
        ],
      },
      pushpa2: {
        asOf: "2026-06-20",
        movieTitle: "Pushpa 2: The Rule",
        releaseDate: "2024-12-05",
        counts: { totalRows: 1 },
        sourceChecks: [{ id: "pushpa2", url: "https://example.com/pushpa2" }],
      },
      pulse: {
        asOf: "2026-06-20",
        movieSignals: [{ id: "movie-signal" }],
        theaterSignals: [
          {
            id: "theater-signal",
            movieTitle: "Cocktail 2",
            language: "Hindi",
            signalDate: "2026-06-20",
            sourceType: "current-showtime",
            sourceQuality: "public-showtime-list",
            theaterName: "AMC First Colony 24",
            chain: "AMC Theatres",
            city: "Sugar Land",
            state: "TX",
            sourceUrl: "https://example.com/showtime",
            sourceCapturedAt: "2026-06-20",
            joinedMarketRef: { kind: "pocket", id: "31000US26420" },
            joinedMarketName: "Houston-The Woodlands-Sugar Land",
            matchConfidence: "direct-metro",
            note: "Public showtime list, not attendance.",
          },
        ],
      },
    });

    expect(snapshot).toMatchObject({
      capturedAt: "2026-06-20",
      sources: [
        {
          id: "cinema-blockbuster-markets",
          releaseSources: [{ id: "jawan", movieTitle: "Jawan" }],
        },
        {
          id: "cinema-pushpa2-theaters",
          movieTitle: "Pushpa 2: The Rule",
        },
        {
          id: "cinema-pulse-baselines",
          movieSignalCount: 1,
        },
      ],
      citySummaries: [
        {
          key: "USA:IL:moline",
          theaters: [{ theaterName: "Moline IL-IA 10" }],
        },
      ],
      theaterSignals: [
        {
          id: "theater-signal",
          joinedMarketName: "Houston-The Woodlands-Sugar Land",
        },
      ],
    });
  });
});
