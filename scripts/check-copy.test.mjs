import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { findCopyViolations, scanCopyTargets } from "./check-copy.mjs";

describe("copy guardrails", () => {
  test("flags em and en dashes with file and line details", () => {
    const text = "const copy = 'Evidence first — no shortcuts';\nconst other = 'A–B';";

    expect(findCopyViolations(text, "app/page.tsx")).toEqual([
      expect.objectContaining({
        file: "app/page.tsx",
        line: 1,
        term: "—",
        rule: "no-em-or-en-dash",
      }),
      expect.objectContaining({
        file: "app/page.tsx",
        line: 2,
        term: "–",
        rule: "no-em-or-en-dash",
      }),
    ]);
  });

  test("flags banned performance claims from public copy", () => {
    const text = "Public data proves CAC and ROI for Dallas.";

    expect(findCopyViolations(text, "components/card.tsx")).toEqual([
      expect.objectContaining({ term: "CAC", rule: "banned-claim" }),
      expect.objectContaining({ term: "ROI", rule: "banned-claim" }),
    ]);
  });

  test("does not allow team attribution to bypass performance claim checks", () => {
    const text = "The highest-ROI lever your team identified improves KYC completion.";

    expect(findCopyViolations(text, "components/card.tsx")).toEqual([
      expect.objectContaining({ term: "KYC completion", rule: "banned-claim" }),
      expect.objectContaining({ term: "ROI", rule: "banned-claim" }),
    ]);
  });

  test("allows banned terms inside connector-needed export schemas", () => {
    const text =
      "Connector needed: requires Xpat exports with spend, CAC, ROI, KYC completion, and first transfer fields.";

    expect(findCopyViolations(text, "app/playbook/page.tsx")).toEqual([]);
  });

  test("scans only configured app copy targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "xpat-copy-"));
    await mkdir(join(root, "app"), { recursive: true });
    await mkdir(join(root, "components"), { recursive: true });
    await mkdir(join(root, "docs"), { recursive: true });

    await writeFile(join(root, "app", "page.tsx"), "const copy = 'CAC claim';");
    await writeFile(join(root, "components", "ok.tsx"), "const copy = 'Connector needed: spend export';");
    await writeFile(join(root, "docs", "ignored.md"), "Docs may say CAC.");

    const violations = await scanCopyTargets(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual(
      expect.objectContaining({
        file: "app/page.tsx",
        term: "CAC",
      }),
    );
  });
});
