import { readFile } from "node:fs/promises";
import { join } from "node:path";

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDotenv(text) {
  const entries = {};

  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.replace(/^export\s+/u, "").trim();
    if (!key) {
      continue;
    }
    entries[key] = stripQuotes(rawValue.join("="));
  }

  return entries;
}

async function readDotenvFile(filePath) {
  try {
    return parseDotenv(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function loadPipelineEnv({ root = process.cwd() } = {}) {
  const files = [join(root, ".env.local"), join(root, ".env")];
  const loadedFiles = [];
  const loadedKeys = [];
  const skippedKeys = [];
  const initiallyPresent = new Set(Object.keys(process.env));

  for (const file of files) {
    const parsed = await readDotenvFile(file);
    if (!parsed) {
      continue;
    }

    loadedFiles.push(file);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
        loadedKeys.push(key);
      } else if (initiallyPresent.has(key) && !skippedKeys.includes(key)) {
        skippedKeys.push(key);
      }
    }
  }

  return { loadedFiles, loadedKeys, skippedKeys };
}
