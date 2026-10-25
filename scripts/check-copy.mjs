#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_DIRS = ["app", "components", "data/artifacts"];
const TEXT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".json"]);
const DASH_PATTERN = /[\u2013\u2014]/g;
const ENV_VAR_PATTERN = /\b[A-Z]{3,}_[A-Z_]{3,}\b/g;
const CODE_DISCLOSURE_PATTERN = /<code\b(?=[^>]*\bdata-copy-code\b)[^>]*>[\s\S]*?<\/code>/gi;

const BANNED_CLAIMS = [
  { term: "spend", pattern: /\bspend\b/i },
  { term: "CAC", pattern: /\bCAC\b/i },
  { term: "CPA", pattern: /\bCPA\b/i },
  { term: "conversion rate", pattern: /\bconversion rate\b/i },
  { term: "KYC completion", pattern: /\bKYC completion\b/i },
  { term: "first transfer", pattern: /\bfirst transfer\b/i },
  { term: "repeat transfer", pattern: /\brepeat transfer\b/i },
  { term: "LTV", pattern: /\bLTV\b/i },
  { term: "ROI", pattern: /\bROI\b/i },
  { term: "delivery of a specific ad", pattern: /\bdelivery of a specific ad\b/i },
  { term: "specific geo", pattern: /\bspecific geo\b/i },
  { term: "individual identity", pattern: /\bindividual identity\b/i },
  { term: "visa status", pattern: /\bvisa status\b/i },
];

const ALLOWED_CLAIM_CONTEXTS = [
  /connector[- ]needed/i,
  /requires xpat/i,
  /xpat exports?/i,
  /export schema/i,
  /\bschema\b/i,
  /\bmissing\b/i,
  /does not prove/i,
  /not prove/i,
  /do not infer/i,
  /not campaign/i,
  /\bnever\b/i,
  /not implied/i,
  /no .* implied/i,
];

export function findCopyViolations(text, file) {
  const violations = [];
  const lines = text.split(/\r?\n/);
  const codeDisclosureSpans = disclosureSpans(text);
  const checkEnvVars = /\.(?:html|jsx|json|tsx)$/u.test(file);
  let lineStart = 0;

  lines.forEach((lineText, index) => {
    const line = index + 1;
    for (const match of lineText.matchAll(DASH_PATTERN)) {
      violations.push({
        file,
        line,
        column: (match.index ?? 0) + 1,
        term: match[0],
        rule: "no-em-or-en-dash",
        message: "Use commas, periods, or ASCII hyphens instead of em/en dashes.",
      });
    }

    if (checkEnvVars) {
      for (const match of lineText.matchAll(ENV_VAR_PATTERN)) {
        const column = (match.index ?? 0) + 1;
        const absoluteIndex = lineStart + column - 1;
        if (isInsideSpans(absoluteIndex, codeDisclosureSpans)) {
          continue;
        }
        if (!isRenderedTextCandidate(lineText, match.index ?? 0)) {
          continue;
        }

        violations.push({
          file,
          line,
          column,
          term: match[0],
          rule: "raw-env-var",
          message: "Move raw setup variable names into a code-labeled disclosure.",
        });
      }
    }

    if (isAllowedClaimContext(lineText)) {
      lineStart += lineText.length + 1;
      return;
    }

    for (const claim of BANNED_CLAIMS) {
      const match = lineText.match(claim.pattern);
      if (match) {
        violations.push({
          file,
          line,
          column: match.index + 1,
          term: claim.term,
          rule: "banned-claim",
          message:
            "Public-data UI copy must not assert spend, CAC, conversion, ROI, identity, visa, or funnel-performance claims.",
        });
      }
    }

    lineStart += lineText.length + 1;
  });

  return violations;
}

export async function scanCopyTargets(root = process.cwd()) {
  const files = [];

  for (const target of TARGET_DIRS) {
    await collectFiles(join(root, target), root, files);
  }

  const violations = [];
  for (const file of files.sort()) {
    const text = await readFile(join(root, file), "utf8");
    violations.push(...findCopyViolations(text, file));
  }

  return violations;
}

async function collectFiles(path, root, files) {
  let pathStat;
  try {
    pathStat = await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  if (pathStat.isFile()) {
    if (
      TEXT_EXTENSIONS.has(extname(path)) &&
      !path.includes(".test.") &&
      !path.includes("xpat-ad-performance.json")
    ) {
      files.push(relative(root, path));
    }
    return;
  }

  if (!pathStat.isDirectory()) return;

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    await collectFiles(join(path, entry.name), root, files);
  }
}

function isAllowedClaimContext(lineText) {
  return ALLOWED_CLAIM_CONTEXTS.some((pattern) => pattern.test(lineText));
}

function disclosureSpans(text) {
  return [...text.matchAll(CODE_DISCLOSURE_PATTERN)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function isInsideSpans(index, spans) {
  return spans.some((span) => index >= span.start && index < span.end);
}

function isRenderedTextCandidate(lineText, index) {
  if (isInsideQuotedString(lineText, index)) return true;

  const previousTagClose = lineText.lastIndexOf(">", index);
  const previousTagOpen = lineText.lastIndexOf("<", index);
  return previousTagClose > previousTagOpen;
}

function isInsideQuotedString(lineText, index) {
  let activeQuote = "";
  let escaped = false;

  for (let cursor = 0; cursor < index; cursor += 1) {
    const char = lineText[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (activeQuote) {
      if (char === activeQuote) {
        activeQuote = "";
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      activeQuote = char;
    }
  }

  return Boolean(activeQuote);
}

function formatViolation(violation) {
  return `${violation.file}:${violation.line}:${violation.column} ${violation.rule} ${violation.term} - ${violation.message}`;
}

async function main() {
  const violations = await scanCopyTargets(process.cwd());

  if (violations.length > 0) {
    console.error("Copy guardrail violations:");
    for (const violation of violations) {
      console.error(formatViolation(violation));
    }
    process.exitCode = 1;
    return;
  }

  console.log("Copy guardrails passed.");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);

if (invokedPath === currentPath) {
  await main();
}
