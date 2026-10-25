import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function sortByStableJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

export function normalizeForDeterministicJson(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForDeterministicJson).sort(sortByStableJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForDeterministicJson(value[key])]),
    );
  }

  return value;
}

export function normalizeForDeterministicJsonPreservingArrays(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForDeterministicJsonPreservingArrays);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForDeterministicJsonPreservingArrays(value[key])]),
    );
  }

  return value;
}

export function deterministicStringify(value) {
  return `${JSON.stringify(normalizeForDeterministicJson(value), null, 2)}\n`;
}

export function deterministicStringifyPreservingArrays(value) {
  return `${JSON.stringify(normalizeForDeterministicJsonPreservingArrays(value), null, 2)}\n`;
}

export async function writeDeterministicJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, deterministicStringify(value), "utf8");
}

export async function writeDeterministicJsonPreservingArrays(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, deterministicStringifyPreservingArrays(value), "utf8");
}
