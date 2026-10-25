import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { dailyGeneratedAt, frankfurterHistoryUrl, runPlaybookContext } from "./context.mjs";

describe("playbook context pipeline", () => {
  it("builds the Frankfurter history window from the run date", () => {
    expect(dailyGeneratedAt("2026-07-09T18:30:00.000Z")).toBe("2026-07-09T00:00:00.000Z");
    expect(frankfurterHistoryUrl("2026-07-09T00:00:00.000Z")).toBe(
      "https://api.frankfurter.dev/v1/2025-07-09..2026-07-09?from=USD&to=INR",
    );
  });

  it("writes connector-needed artifacts when source fetches fail", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-playbook-context-"));

    await runPlaybookContext({
      fetchJsonImpl: async () => {
        throw new Error("rate limited");
      },
      generatedAt: "2026-07-06T00:00:00.000Z",
      root,
    });

    const corridor = JSON.parse(await readFile(join(root, "data/artifacts/corridor-context.json"), "utf8"));
    const fx = JSON.parse(await readFile(join(root, "data/artifacts/fx-history.json"), "utf8"));

    expect(corridor).toMatchObject({
      data: null,
      meta: { provenance: "connector-needed", error: "rate limited" },
    });
    expect(fx).toMatchObject({
      data: null,
      meta: { provenance: "connector-needed", error: "rate limited" },
    });
  });

  it("writes connector-needed corridor artifact without blocking FX on malformed World Bank data", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-playbook-context-"));

    await runPlaybookContext({
      fetchJsonImpl: async (url) => {
        if (url.includes("worldbank.org")) return [{}, []];

        return {
          base: "USD",
          end_date: "2026-07-06",
          rates: {
            "2026-07-03": { INR: 83.5 },
          },
          start_date: "2025-07-06",
        };
      },
      generatedAt: "2026-07-06T00:00:00.000Z",
      root,
    });

    const corridor = JSON.parse(await readFile(join(root, "data/artifacts/corridor-context.json"), "utf8"));
    const fx = JSON.parse(await readFile(join(root, "data/artifacts/fx-history.json"), "utf8"));

    expect(corridor).toMatchObject({
      data: null,
      meta: {
        error: "World Bank payload missing India remittance value",
        provenance: "connector-needed",
      },
    });
    expect(fx).toMatchObject({
      data: {
        current: { date: "2026-07-03", rate: 83.5 },
        rates: [{ date: "2026-07-03", rate: 83.5 }],
      },
      meta: { provenance: "grounded" },
    });
  });
});
