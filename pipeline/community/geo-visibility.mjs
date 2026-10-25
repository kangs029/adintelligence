import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import { writeDeterministicJsonPreservingArrays } from "../lib/provenance.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "geo-visibility.json");

export const geoVisibilityQueries = [
  "best way to send money from USA to India",
  "cheapest USD to INR transfer",
  "best remittance app for NRIs",
  "Wise vs Remitly for India",
  "is Xpat money transfer legit",
];

export const geoVisibilityAssistants = ["ChatGPT", "Gemini", "Claude", "Perplexity"];

export const geoVisibilityCellSchema = z.discriminatedUnion("status", [
  z.object({
    assistant: z.string(),
    capturedAt: z.string(),
    evidenceScreenshotPath: z.string(),
    method: z.literal("manual capture"),
    providersNamed: z.array(z.string()),
    query: z.string(),
    status: z.literal("captured"),
    xpatMentioned: z.boolean(),
  }),
  z.object({
    assistant: z.string(),
    capturedAt: z.null(),
    evidenceScreenshotPath: z.null(),
    method: z.literal("manual capture"),
    pendingReason: z.string(),
    providersNamed: z.array(z.string()).length(0),
    query: z.string(),
    status: z.literal("capture-pending"),
    xpatMentioned: z.literal(false),
  }),
]);

export const geoVisibilityArtifactSchema = z.object({
  data: z.object({
    assistants: z.array(z.string()),
    capturedAnswers: z.number(),
    cells: z.array(geoVisibilityCellSchema),
    competitorsAppearing: z.array(z.string()),
    queries: z.array(z.string()),
    status: z.literal("partial"),
    totalCells: z.number(),
    xpatMentions: z.number(),
  }),
  meta: z.object({
    caveats: z.array(z.string()),
    family: z.literal("geo-visibility"),
    generatedAt: z.string(),
    method: z.string(),
    provenance: z.literal("snapshot"),
    refreshCadence: z.string(),
    source: z.string(),
    version: z.number(),
  }),
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function cellKey(cell) {
  return `${cell.query}\u0000${cell.assistant}`;
}

function isXpatProvider(provider) {
  return /^(?:xpat|xpat\.money|remit2any)$/iu.test(provider);
}

function summarizeCells(cells) {
  const captured = cells.filter((cell) => cell.status === "captured");
  const competitorsAppearing = [
    ...new Set(captured.flatMap((cell) => cell.providersNamed).filter((provider) => !isXpatProvider(provider))),
  ].sort((left, right) => left.localeCompare(right));

  return {
    capturedAnswers: captured.length,
    competitorsAppearing,
    totalCells: cells.length,
    xpatMentions: captured.filter((cell) => cell.xpatMentioned).length,
  };
}

export function buildPendingGeoVisibilityArtifact({ generatedAt = new Date().toISOString() } = {}) {
  const cells = geoVisibilityQueries.flatMap((query) =>
    geoVisibilityAssistants.map((assistant) => ({
      assistant,
      capturedAt: null,
      evidenceScreenshotPath: null,
      method: "manual capture",
      pendingReason:
        "Manual assistant answer capture is pending. Do not infer named providers without a screenshot.",
      providersNamed: [],
      query,
      status: "capture-pending",
      xpatMentioned: false,
    })),
  );

  return geoVisibilityArtifactSchema.parse({
    meta: {
      caveats: [
        "AI assistants are a growing discovery surface for corridor queries. This grid is a dated visibility benchmark, re-run monthly.",
        "Pending cells mean no answer screenshot was captured, not that a provider was absent.",
      ],
      family: "geo-visibility",
      generatedAt,
      method:
        "Manual capture grid for assistant answers. Each captured answer must include named providers and a screenshot path under data/raw/geo.",
      provenance: "snapshot",
      refreshCadence: "monthly manual capture",
      source: "docs/geo-capture-protocol.md",
      version: 1,
    },
    data: {
      assistants: geoVisibilityAssistants,
      capturedAnswers: 0,
      cells,
      competitorsAppearing: [],
      queries: geoVisibilityQueries,
      status: "partial",
      totalCells: cells.length,
      xpatMentions: 0,
    },
  });
}

export function validateGeoVisibilityArtifact(artifact) {
  return geoVisibilityArtifactSchema.parse(artifact);
}

export function generatedAtForGeoVisibilityRun({ existingArtifact, generatedAt } = {}) {
  return generatedAt ?? existingArtifact?.meta?.generatedAt ?? new Date().toISOString();
}

export function mergeCapturedGeoVisibilityCells(baseArtifact, existingArtifact) {
  if (!existingArtifact) return baseArtifact;

  const currentKeys = new Set(baseArtifact.data.cells.map(cellKey));
  const capturedByKey = new Map(
    validateGeoVisibilityArtifact(existingArtifact)
      .data.cells.filter((cell) => cell.status === "captured" && currentKeys.has(cellKey(cell)))
      .map((cell) => [cellKey(cell), cell]),
  );
  const cells = baseArtifact.data.cells.map((cell) => capturedByKey.get(cellKey(cell)) ?? cell);

  return geoVisibilityArtifactSchema.parse({
    ...baseArtifact,
    data: {
      ...baseArtifact.data,
      ...summarizeCells(cells),
      cells,
    },
  });
}

export async function runGeoVisibility({ generatedAt = process.env.PIPELINE_GENERATED_AT, root = process.cwd() } = {}) {
  const artifactPath = join(root, ARTIFACT_FILE);
  const existingArtifact = existsSync(artifactPath) ? readJson(artifactPath) : undefined;
  const baseArtifact = buildPendingGeoVisibilityArtifact({
    generatedAt: generatedAtForGeoVisibilityRun({ existingArtifact, generatedAt }),
  });
  const artifact = mergeCapturedGeoVisibilityCells(baseArtifact, existingArtifact);

  await writeDeterministicJsonPreservingArrays(artifactPath, artifact);
  return artifact;
}

export function latestGeoVisibilityArtifact({ root = process.cwd() } = {}) {
  return validateGeoVisibilityArtifact(readJson(join(root, ARTIFACT_FILE)));
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).pathname : "";
if (invokedPath === new URL(import.meta.url).pathname) {
  await runGeoVisibility();
}
