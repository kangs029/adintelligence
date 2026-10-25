import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deterministicStringify,
  normalizeForDeterministicJson,
  writeDeterministicJson,
} from "./provenance.mjs";

describe("deterministic provenance helpers", () => {
  it("normalizes object keys, arrays, and dates before serialization", () => {
    const left = {
      z: ["beta", "alpha"],
      generatedAt: new Date("2026-07-02T19:00:00.000Z"),
      a: {
        list: [{ b: 2, a: 1 }, { a: 0 }],
      },
    };
    const right = {
      a: {
        list: [{ a: 0 }, { a: 1, b: 2 }],
      },
      generatedAt: "2026-07-02T19:00:00.000Z",
      z: ["alpha", "beta"],
    };

    expect(normalizeForDeterministicJson(left)).toEqual(right);
    expect(deterministicStringify(left)).toBe(deterministicStringify(right));
  });

  it("writes formatted json with a stable trailing newline", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-provenance-"));
    const file = join(root, "nested", "artifact.json");

    await writeDeterministicJson(file, {
      data: [{ id: "b" }, { id: "a" }],
      meta: { version: 1 },
    });

    await expect(readFile(file, "utf8")).resolves.toBe(
      [
        "{",
        '  "data": [',
        "    {",
        '      "id": "a"',
        "    },",
        "    {",
        '      "id": "b"',
        "    }",
        "  ],",
        '  "meta": {',
        '    "version": 1',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
  });
});
