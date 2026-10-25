import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("playbook print stylesheet", () => {
  it("defines print-only dossier rules for the leave-behind PDF", () => {
    const css = readFileSync(join(process.cwd(), "app", "playbook", "print.module.css"), "utf8");

    expect(css).toContain("@media print");
    expect(css).toContain(":global(.top-nav)");
    expect(css).toContain(":global(.market-picker)");
    expect(css).toContain("break-inside: avoid");
    expect(css).toContain("page-break-before");
  });
});
