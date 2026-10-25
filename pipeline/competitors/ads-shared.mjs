import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

export const MAX_ADS_PER_COMPETITOR = 6;

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

export function sanitizeAdDisplayText(value) {
  const text = cleanText(value);
  if (!text) return null;

  return text.replace(/[—–]/gu, "-").replace(/\bfirst transfer\b/giu, "initial transfer");
}

export function dateId(value) {
  return String(value).slice(0, 10);
}

export function evidencePaths({ filename, root, slug }) {
  const screenshotRawPath = join("data", "raw", "ads", slug, filename);
  const publicRelativePath = join("evidence", "ads", slug, filename);
  const publicFilePath = join("public", publicRelativePath);

  return {
    publicFilePath: join(root, publicFilePath),
    screenshotPath: `/${publicRelativePath.split(sep).join("/")}`,
    screenshotRawPath,
    screenshotRawFilePath: join(root, screenshotRawPath),
  };
}

export async function ensureEvidenceDirs(paths) {
  await mkdir(dirname(paths.screenshotRawFilePath), { recursive: true });
  await mkdir(dirname(paths.publicFilePath), { recursive: true });
}

export async function copyRawToPublic(paths) {
  await copyFile(paths.screenshotRawFilePath, paths.publicFilePath);
}

export function parseEnglishDateToIso(value) {
  const raw = cleanText(value);
  if (!raw) return null;

  const parsed = Date.parse(`${raw} UTC`);
  if (Number.isNaN(parsed)) return raw;

  return new Date(parsed).toISOString().slice(0, 10);
}

export function uniqueBy(items, getKey) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}
