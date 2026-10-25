import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runCinema } from "./run-cinema.mjs";

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), "xpat-run-cinema-"));
  await mkdir(join(root, "data", "artifacts"), { recursive: true });
  await mkdir(join(root, "data", "raw", "cinema"), { recursive: true });
  await writeFile(
    join(root, "data", "raw", "cinema", "cinema-blockbuster-markets.json"),
    JSON.stringify({
      asOf: "2026-06-20",
      description: "Fixture",
      counts: { movies: 1 },
      releaseSources: [{ id: "jawan", movieTitle: "Jawan" }],
      citySummaries: [
        {
          key: "USA:TX:plano",
          country: "USA",
          regionCode: "TX",
          city: "Plano",
          rowCount: 1,
          movieCount: 1,
          theaterCount: 1,
          languages: ["Hindi"],
        },
      ],
    }),
  );
  await writeFile(
    join(root, "data", "raw", "cinema", "cinema-pushpa2-theaters.json"),
    JSON.stringify({
      asOf: "2026-06-20",
      movieTitle: "Pushpa 2: The Rule",
      releaseDate: "2024-12-05",
      counts: { totalRows: 1 },
      sourceChecks: [],
    }),
  );
  await writeFile(
    join(root, "data", "raw", "cinema", "cinema-pulse-baselines.json"),
    JSON.stringify({
      asOf: "2026-06-20",
      movieSignals: [],
      theaterSignals: [],
      sourceChecks: [],
    }),
  );
  return root;
}

describe("runCinema", () => {
  it("writes a compact cinema snapshot artifact from v1 raw JSONs", async () => {
    const root = await makeRoot();

    await runCinema({
      root,
      generatedAt: "2026-07-03T00:00:00.000Z",
    });

    const artifact = JSON.parse(
      await readFile(join(root, "data", "artifacts", "cinema.json"), "utf8"),
    );

    expect(artifact).toMatchObject({
      meta: {
        family: "cinema",
        provenance: "snapshot",
        generatedAt: "2026-07-03T00:00:00.000Z",
      },
      data: {
        capturedAt: "2026-06-20",
        citySummaries: [{ key: "USA:TX:plano" }],
      },
    });
  });
});
