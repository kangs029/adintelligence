import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadPipelineEnv, parseDotenv } from "./env.mjs";

const touchedKeys = new Set();

function setEnv(key, value) {
  touchedKeys.add(key);
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of touchedKeys) {
    delete process.env[key];
  }
  touchedKeys.clear();
});

describe("pipeline env loading", () => {
  it("parses dotenv lines without exposing values in logs", () => {
    expect(
      parseDotenv(`
        # comment
        export CENSUS_API_KEY="abc123"
        PIPELINE_GENERATED_AT='2026-07-02T00:00:00.000Z'
      `),
    ).toEqual({
      CENSUS_API_KEY: "abc123",
      PIPELINE_GENERATED_AT: "2026-07-02T00:00:00.000Z",
    });
  });

  it("loads .env.local before .env and does not override existing process env", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-env-"));
    await writeFile(join(root, ".env"), "CENSUS_API_KEY=from-env\nOTHER_KEY=from-env\n");
    await writeFile(join(root, ".env.local"), "CENSUS_API_KEY=from-local\n");
    setEnv("CENSUS_API_KEY", undefined);
    setEnv("OTHER_KEY", "already-set");

    expect(await loadPipelineEnv({ root })).toEqual({
      loadedFiles: [join(root, ".env.local"), join(root, ".env")],
      loadedKeys: ["CENSUS_API_KEY"],
      skippedKeys: ["OTHER_KEY"],
    });
    expect(process.env.CENSUS_API_KEY).toBe("from-local");
    expect(process.env.OTHER_KEY).toBe("already-set");
  });
});
