import { describe, expect, it } from "vitest";

import {
  buildPendingGeoVisibilityArtifact,
  generatedAtForGeoVisibilityRun,
  geoVisibilityArtifactSchema,
  mergeCapturedGeoVisibilityCells,
} from "./geo-visibility.mjs";

describe("geo visibility artifact", () => {
  it("validates the pending capture grid without guessing provider names", () => {
    const artifact = buildPendingGeoVisibilityArtifact();

    expect(() => geoVisibilityArtifactSchema.parse(artifact)).not.toThrow();
    expect(artifact.data.capturedAnswers).toBe(0);
    expect(artifact.data.totalCells).toBe(20);
    expect(artifact.data.queries).toEqual([
      "best way to send money from USA to India",
      "cheapest USD to INR transfer",
      "best remittance app for NRIs",
      "Wise vs Remitly for India",
      "is Xpat money transfer legit",
    ]);
    expect(artifact.data.cells.every((cell) => cell.status === "capture-pending")).toBe(true);
    expect(artifact.data.cells).toHaveLength(artifact.data.queries.length * artifact.data.assistants.length);
  });

  it("preserves captured cells on reruns and recomputes evidence totals", () => {
    const base = buildPendingGeoVisibilityArtifact();
    const capturedCell = {
      ...base.data.cells[0],
      capturedAt: "2026-07-06T02:00:00.000Z",
      evidenceScreenshotPath: "data/raw/geo/chatgpt-usd-inr.png",
      providersNamed: ["Remitly", "Wise", "Xpat"],
      status: "captured",
      xpatMentioned: true,
    };
    const existing = geoVisibilityArtifactSchema.parse({
      ...base,
      data: {
        ...base.data,
        capturedAnswers: 1,
        cells: [capturedCell, ...base.data.cells.slice(1)],
        competitorsAppearing: ["Remitly", "Wise"],
        xpatMentions: 1,
      },
    });

    const merged = mergeCapturedGeoVisibilityCells(buildPendingGeoVisibilityArtifact(), existing);

    expect(merged.data.capturedAnswers).toBe(1);
    expect(merged.data.competitorsAppearing).toEqual(["Remitly", "Wise"]);
    expect(merged.data.xpatMentions).toBe(1);
    expect(merged.data.cells[0]).toMatchObject({
      capturedAt: "2026-07-06T02:00:00.000Z",
      evidenceScreenshotPath: "data/raw/geo/chatgpt-usd-inr.png",
      providersNamed: ["Remitly", "Wise", "Xpat"],
      status: "captured",
      xpatMentioned: true,
    });
    expect(merged.data.cells.slice(1).every((cell) => cell.status === "capture-pending")).toBe(true);
  });

  it("reuses the existing generatedAt when reruns have no explicit timestamp", () => {
    const existing = buildPendingGeoVisibilityArtifact({
      generatedAt: "2026-07-06T02:00:00.000Z",
    });

    expect(generatedAtForGeoVisibilityRun({ existingArtifact: existing })).toBe("2026-07-06T02:00:00.000Z");
    expect(
      generatedAtForGeoVisibilityRun({
        existingArtifact: existing,
        generatedAt: "2026-07-07T00:00:00.000Z",
      }),
    ).toBe("2026-07-07T00:00:00.000Z");
  });
});
