import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";

import { createArtifactSchema, type Artifact } from "../types";

interface LoadArtifactOptions {
  root?: string;
}

const ARTIFACT_FAMILY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function formatIssuePath(path: Array<PropertyKey>) {
  return path.map(String).join(".");
}

function formatArtifactErrors(error: { issues: Array<{ path: Array<PropertyKey>; message: string }> }) {
  return error.issues
    .map((issue) => `${formatIssuePath(issue.path) || "artifact"}: ${issue.message}`)
    .join("; ");
}

export function loadArtifact<T>(
  family: string,
  schema: ZodType<T>,
  options: LoadArtifactOptions = {},
): Artifact<T> {
  if (!ARTIFACT_FAMILY_PATTERN.test(family)) {
    throw new Error(
      `Invalid artifact family "${family}". Use lowercase letters, numbers, and hyphens only.`,
    );
  }

  const root = options.root ?? process.cwd();
  const filePath = join(root, "data", "artifacts", `${family}.json`);
  let raw: string;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read artifact ${family} at ${filePath}`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Artifact ${family} contains invalid JSON at ${filePath}`, { cause: error });
  }

  const artifactSchema = createArtifactSchema(schema);
  const result = artifactSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Artifact ${family} failed schema validation: ${formatArtifactErrors(result.error)}`,
    );
  }

  if (result.data.meta.family !== family) {
    throw new Error(
      `Artifact ${family} failed schema validation: meta.family must equal "${family}".`,
    );
  }

  return result.data;
}
