import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { competitorProfiles } from "./profiles.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "competitor-positioning.json");
const OVERLAY_FILE = join("data", "curation", "competitor-positioning.json");

const chromePatterns = [
  /\(?\s*opens in new window\s*\)?/giu,
  /\bSkip to content\b/giu,
  /\bSend amount\s+USD\s+Receiver gets\s+INR\s+Send money now\b/giu,
  /\bLog In\s+Sign up\b/giu,
];

const navigationPatterns = [
  /^one per customer\.?$/iu,
  /^limited time offer\.?$/iu,
  /^create free account now\b/iu,
  /^personal business platform\b/iu,
  /^send amount\s+usd\b/iu,
  /\bmakes money from fx\b/iu,
  /\breceiver gets\s+inr\b/iu,
  /\bsend money now\b/iu,
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function stripUiChrome(value) {
  let text = cleanText(value);
  for (const pattern of chromePatterns) {
    text = text.replace(pattern, " ");
  }
  return cleanText(text).replace(/\s+([.,!?])/gu, "$1");
}

function sentences(text) {
  return stripUiChrome(text)
    .split(/(?<=[.!?])\s+/u)
    .map(stripUiChrome)
    .filter((line) => line.length >= 8 && line.length <= 220);
}

function firstMatching(lines, pattern) {
  return lines.find((line) => pattern.test(line)) ?? null;
}

function wordCount(value) {
  return cleanText(value).split(/\s+/u).filter(Boolean).length;
}

function isChromeFragment(line) {
  const cleaned = cleanText(line);
  return wordCount(cleaned) < 5 || navigationPatterns.some((pattern) => pattern.test(cleaned));
}

function cleanField(value) {
  const cleaned = stripUiChrome(value);
  return cleaned ? cleaned : null;
}

function cleanPositioningLine(value) {
  const cleaned = cleanField(value);
  if (!cleaned || isChromeFragment(cleaned)) {
    return null;
  }
  return cleaned;
}

function likelyPositioningLine(lines, headline) {
  const candidates = lines.filter((line) => {
    const cleanedHeadline = cleanText(headline);
    return line !== cleanedHeadline && !/cookie|privacy|terms/iu.test(line) && cleanPositioningLine(line);
  });

  return (
    candidates.find((line) => /\b(send|transfer|money|india|remittance|international|nri)\b/iu.test(line)) ??
    candidates.find((line) => /\b(fast|secure|rate|rates|fees?|affordable|value)\b/iu.test(line)) ??
    null
  );
}

function normalizeIntroOffer(sentence) {
  if (!sentence) return null;
  if (/\bfirst transfer\b/iu.test(sentence)) {
    return "Intro offer observed on the landing page.";
  }
  return sentence;
}

function daysSince(value, now) {
  return (new Date(now).getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000);
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function extractPositioningSignals({ h1, text, title }) {
  const visibleSentences = sentences(text);
  const headline = cleanText(h1) || cleanText(title) || null;
  const positioningLine = likelyPositioningLine(visibleSentences, headline) ?? headline;
  const introOffer = normalizeIntroOffer(
    firstMatching(visibleSentences, /\b(intro|new customer|first-time|promo|promotion|offer|fee-free|free)\b/iu),
  );

  return {
    feeClaim: cleanField(firstMatching(visibleSentences, /\b(fee|fees|fee-free|price|cost)\b/iu)),
    headline,
    introOffer,
    positioningLine: cleanPositioningLine(positioningLine) ?? headline,
    speedClaim: cleanField(
      firstMatching(visibleSentences, /\b(minutes?|instant|same day|delivery|arrive|fast|speed|seconds)\b/iu),
    ),
  };
}

export function mergePositioningOverlay(profiles, overlay = []) {
  const byCompetitor = new Map(overlay.map((item) => [item.competitor, item]));

  return profiles.map((profile) => {
    const override = byCompetitor.get(profile.competitor) ?? {};

    return {
      ...profile,
      feeClaim: cleanField(override.feeClaim ?? profile.feeClaim),
      headline: cleanField(override.headline ?? profile.headline),
      introOffer: cleanField(override.introOffer ?? profile.introOffer),
      positioningLine: cleanPositioningLine(override.positioningLine ?? profile.positioningLine),
      speedClaim: cleanField(override.speedClaim ?? profile.speedClaim),
    };
  });
}

export function positioningRecordFromPage({ capturedAt, competitor, error, pageData }) {
  if (error) {
    return {
      capturedAt,
      caveat: error instanceof Error ? error.message : String(error),
      competitor: competitor.competitor,
      feeClaim: null,
      headline: null,
      introOffer: null,
      landingPageUrl: competitor.landingPageUrl,
      positioningLine: null,
      screenshotRawPath: null,
      speedClaim: null,
      status: "no-public-page-captured",
    };
  }

  const signals = extractPositioningSignals(pageData ?? {});

  return {
    capturedAt,
    caveat: null,
    competitor: competitor.competitor,
    feeClaim: signals.feeClaim,
    headline: signals.headline,
    introOffer: signals.introOffer,
    landingPageUrl: competitor.landingPageUrl,
    positioningLine: signals.positioningLine,
    screenshotRawPath: pageData?.screenshotRawPath ?? null,
    speedClaim: signals.speedClaim,
    status: "snapshot",
  };
}

export function buildPositioningArtifact({ generatedAt = new Date().toISOString(), profiles }) {
  return {
    meta: {
      caveats: [
        "Positioning cards quote or summarize public landing-page copy only.",
        "Public page copy does not prove targeting, delivery, or performance.",
      ],
      family: "competitor-positioning",
      generatedAt,
      method:
        "Weekly-max Playwright capture of each competitor US to India landing page. Raw screenshots stay in data/raw/positioning. Curated overlay merges hand-reviewed positioning copy.",
      provenance: "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "Competitor public landing pages",
      version: 1,
    },
    data: {
      profiles,
    },
  };
}

async function capturePositioningPages({ browser, capturedAt, competitors, delayMs, root }) {
  const context = await browser.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 xpat-os/0.1",
    viewport: { width: 1440, height: 1100 },
  });
  const rawDir = join(root, "data", "raw", "positioning");
  await mkdir(rawDir, { recursive: true });
  const profiles = [];

  for (const competitor of competitors) {
    const page = await context.newPage();
    const screenshotRawPath = join("data", "raw", "positioning", `${competitor.slug}.png`);

    try {
      await page.goto(competitor.landingPageUrl, { timeout: 45_000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(delayMs);
      await page.screenshot({ fullPage: true, path: join(root, screenshotRawPath) });
      const [title, h1, text] = await Promise.all([
        page.title().catch(() => ""),
        page.locator("h1").first().innerText({ timeout: 5_000 }).catch(() => ""),
        page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""),
      ]);

      profiles.push(
        positioningRecordFromPage({
          capturedAt,
          competitor,
          pageData: { h1, screenshotRawPath, text, title },
        }),
      );
    } catch (error) {
      profiles.push(positioningRecordFromPage({ capturedAt, competitor, error }));
    } finally {
      await page.close().catch(() => {});
    }
  }

  await context.close();
  return profiles;
}

export async function runPositioning({
  competitors = competitorProfiles,
  delayMs = 1_500,
  force = process.env.FORCE_POSITIONING_SWEEP === "1",
  generatedAt = new Date().toISOString(),
  root = process.cwd(),
} = {}) {
  const artifactPath = join(root, ARTIFACT_FILE);
  const existing = readJsonIfExists(artifactPath);
  const overlay = readJsonIfExists(join(root, OVERLAY_FILE))?.overrides ?? [];

  if (!force && existing?.meta?.generatedAt && daysSince(existing.meta.generatedAt, generatedAt) < 7) {
    const artifact = buildPositioningArtifact({
      generatedAt: existing.meta.generatedAt,
      profiles: mergePositioningOverlay(existing.data.profiles, overlay),
    });
    await writeDeterministicJson(artifactPath, artifact);
    return artifact;
  }

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });

  try {
    const profiles = await capturePositioningPages({
      browser,
      capturedAt: generatedAt,
      competitors,
      delayMs,
      root,
    });
    const artifact = buildPositioningArtifact({
      generatedAt,
      profiles: mergePositioningOverlay(profiles, overlay),
    });
    await writeDeterministicJson(artifactPath, artifact);
    return artifact;
  } finally {
    await browser.close().catch(() => {});
  }
}
