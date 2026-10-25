import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { competitorProfiles, dateStamp } from "./profiles.mjs";
import {
  MAX_ADS_PER_COMPETITOR,
  cleanText,
  copyRawToPublic,
  ensureEvidenceDirs,
  evidencePaths,
  parseEnglishDateToIso,
  sanitizeAdDisplayText,
  uniqueBy,
} from "./ads-shared.mjs";

const execFileAsync = promisify(execFile);
const GOOGLE_ADS_TRANSPARENCY_BASE = "https://adstransparency.google.com/";

export function googleAdsTransparencyUrl({ domain }) {
  const url = new URL(GOOGLE_ADS_TRANSPARENCY_BASE);
  url.searchParams.set("region", "US");
  url.searchParams.set("domain", domain);
  return url.toString();
}

function googleSearchesFor(competitor) {
  if (competitor.googleSearches?.length) {
    return competitor.googleSearches.map((search) => ({
      label: search.label ?? search.domain ?? search.url,
      url: search.url ?? googleAdsTransparencyUrl({ domain: search.domain }),
    }));
  }

  return [
    {
      label: competitor.domain,
      url: googleAdsTransparencyUrl({ domain: competitor.domain }),
    },
  ];
}

export function classifyGoogleAdPage(bodyText) {
  const text = cleanText(bodyText).toLowerCase();

  if (/no ads found|no results|couldn't find any ads|could not find any ads/u.test(text)) {
    return {
      caveat: "Google Ads Transparency Center returned no public ad cards for this advertiser.",
      status: "no-public-ads-captured",
    };
  }

  if (/browser or app may not be secure|unusual traffic|enable javascript|access denied/u.test(text)) {
    return {
      caveat: "Google Ads Transparency Center did not expose public ad cards to this browser run.",
      status: "blocked",
    };
  }

  if (/last shown|first shown|ad shown|creative format|format:|image ad|video ad/u.test(text)) {
    return { caveat: null, status: "snapshot" };
  }

  return {
    caveat:
      "Google Ads Transparency Center public page loaded, but no parseable ad card text was exposed.",
    status: "no-public-ads-captured",
  };
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/u)
    .map(cleanText)
    .filter(Boolean);
}

function parseCreativeId(sourceUrl) {
  return new URL(sourceUrl).pathname.match(/\/creative\/([^/?#]+)/u)?.[1] ?? null;
}

function parseGoogleDetailText(bodyText) {
  const lines = splitLines(bodyText);
  const firstSeenRaw =
    lines
      .map((line) => line.match(/^First shown:\s*(.+)$/iu)?.[1])
      .find(Boolean) ?? null;
  const lastShownRaw =
    lines
      .map((line) => line.match(/^Last shown:\s*(.+)$/iu)?.[1])
      .find(Boolean) ?? null;
  const mediaType =
    lines
      .map((line) => line.match(/^Format:\s*(.+)$/iu)?.[1])
      .find(Boolean) ?? null;
  const placement =
    lines.find((line) => /^Shown in /iu.test(line)) ??
    lines.find((line) => /^Displayed in /iu.test(line)) ??
    null;

  return {
    firstSeen: parseEnglishDateToIso(firstSeenRaw),
    lastShown: parseEnglishDateToIso(lastShownRaw),
    mediaType,
    placement,
  };
}

function headlineFromOcrLines(lines) {
  const cleanedLines = lines.map(cleanText).filter(Boolean);
  const sponsoredIndex = cleanedLines.findIndex((line) => /^sponsored$/iu.test(line));
  const formatIndex = cleanedLines.findIndex((line) => /^format:/iu.test(line));
  const scopedLines =
    sponsoredIndex >= 0
      ? cleanedLines.slice(sponsoredIndex + 1)
      : formatIndex >= 0
        ? cleanedLines.slice(formatIndex + 1)
        : cleanedLines;
  const advertiserLines = new Set(
    scopedLines
      .filter((line, index) => /^(www\.|https?:)/iu.test(scopedLines[index + 1] ?? ""))
      .map((line) => line.toLowerCase()),
  );
  const blocked = [
    /^ad details$/iu,
    /^faq$/iu,
    /^sign in$/iu,
    /^the information about this ad may vary by location$/iu,
    /^last shown:/iu,
    /^first shown:/iu,
    /^format:/iu,
    /^ad funded by:/iu,
    /^shown in /iu,
    /^google ads transparency center$/iu,
    /^home >/iu,
    /^\d+\s+of\s+\d+\s+variation$/iu,
    /^\d+\s+[a-z0-9.-]+\.(?:com|money|mcney)$/iu,
    /^nan\b/iu,
    /^see more ads by this advertiser/iu,
    /^privacy\b/iu,
    /^-?\s*report this ad$/iu,
    /^sponsored$/iu,
    /^ad$/iu,
    /^www\./iu,
    /^https?:/iu,
    /^unable to find a valid/u,
    /^download$/iu,
    /^install$/iu,
    /^transfer now$/iu,
  ];
  const candidates = scopedLines
    .filter((line) => line.length >= 6)
    .filter((line) => !advertiserLines.has(line.toLowerCase()))
    .filter((line) => !blocked.some((pattern) => pattern.test(line)));

  const headlineIndex = candidates.findIndex((line) => line.length >= 12);
  if (headlineIndex < 0) return { bodyText: null, headline: null };

  const first = candidates[headlineIndex];
  const second = candidates[headlineIndex + 1];
  const headline =
    first.endsWith("-") && second && second.length <= 80
      ? sanitizeAdDisplayText(`${first} ${second}`.slice(0, 180))
      : sanitizeAdDisplayText(first.slice(0, 180));
  const bodyText =
    sanitizeAdDisplayText(
      candidates
        .slice(headlineIndex + (first.endsWith("-") && second ? 2 : 1))
        .find((line) => line.length >= 20)
        ?.slice(0, 220),
    ) ?? null;

  return { bodyText, headline };
}

async function ocrImageWithVision(imagePath) {
  const python = String.raw`
import json
import sys
from Foundation import NSURL, NSDictionary
from Vision import VNImageRequestHandler, VNRecognizeTextRequest, VNRequestTextRecognitionLevelAccurate

url = NSURL.fileURLWithPath_(sys.argv[1])
request = VNRecognizeTextRequest.alloc().init()
request.setRecognitionLevel_(VNRequestTextRecognitionLevelAccurate)
request.setUsesLanguageCorrection_(True)
handler = VNImageRequestHandler.alloc().initWithURL_options_(url, NSDictionary.dictionary())
ok, err = handler.performRequests_error_([request], None)
lines = []
if ok:
    for observation in request.results() or []:
        candidates = observation.topCandidates_(1)
        if candidates:
            lines.append(str(candidates[0].string()))
print("XPAT_OCR_JSON_START" + json.dumps({"lines": lines}) + "XPAT_OCR_JSON_END")
`;

  try {
    const { stdout } = await execFileAsync("python3", ["-c", python, imagePath], {
      maxBuffer: 1024 * 1024,
      timeout: 25_000,
    });
    const match = stdout.match(/XPAT_OCR_JSON_START(.*?)XPAT_OCR_JSON_END/su);
    return match ? JSON.parse(match[1]).lines ?? [] : [];
  } catch {
    return [];
  }
}

function buildNoCaptureGoogleRecord({ capturedAt, caveat, competitor, sourceUrl, status }) {
  return {
    bodyText: null,
    capturedAt,
    caveat,
    competitor: competitor.competitor,
    firstSeen: null,
    headline: null,
    id: `google-${competitor.slug}-${dateStamp(capturedAt)}`,
    lastShown: null,
    mediaType: null,
    placement: null,
    platform: "Google",
    screenshotPath: null,
    screenshotRawPath: null,
    sourceUrl,
    status,
    themes: [],
  };
}

export function buildGoogleAdRecords({ capturedAt, competitors = competitorProfiles, pageResults }) {
  return competitors.flatMap((competitor) => {
    const result = pageResults.get(competitor.competitor) ?? {};
    const sourceUrl = result.sourceUrl ?? googleSearchesFor(competitor)[0].url;
    const cards = uniqueBy(result.cards ?? [], (card) => card.creativeId).slice(
      0,
      MAX_ADS_PER_COMPETITOR,
    );

    if (cards.length > 0) {
      return cards.map((card) => ({
        bodyText: card.bodyText ?? null,
        capturedAt,
        caveat: card.screenshotPath
          ? card.caveat ?? null
          : "Google Ads Transparency Center exposed a public creative, but the screenshot capture failed.",
        competitor: competitor.competitor,
        firstSeen: card.firstSeen ?? null,
        headline: card.headline ?? null,
        id: `google-${competitor.slug}-${card.creativeId}`,
        lastShown: card.lastShown ?? null,
        mediaType: card.mediaType ?? null,
        placement: card.placement ?? null,
        platform: "Google",
        screenshotPath: card.screenshotPath ?? null,
        screenshotRawPath: card.screenshotRawPath ?? null,
        sourceUrl: card.sourceUrl,
        status: "snapshot",
        themes: [],
      }));
    }

    const classification = classifyGoogleAdPage(result.bodyText ?? "");

    return [
      buildNoCaptureGoogleRecord({
        capturedAt,
        caveat:
          result.caveat ??
          (classification.status === "snapshot"
            ? "Google Ads Transparency Center returned public creative metadata, but no creative cards were parseable."
            : classification.caveat),
        competitor,
        sourceUrl,
        status: classification.status === "snapshot" ? "no-public-ads-captured" : classification.status,
      }),
    ];
  });
}

async function collectCreativeLinks(page) {
  await page
    .waitForFunction(
      () =>
        document.querySelector('a[href*="/creative/"]') ||
        /No ads found|No results|Access denied|unusual traffic/iu.test(document.body?.innerText ?? ""),
      { timeout: 18_000 },
    )
    .catch(() => {});
  await page.mouse.wheel(0, 1200).catch(() => {});
  await page.waitForTimeout(750);

  return page.locator('a[href*="/creative/"]').evaluateAll((anchors) => {
    return [...new Set(anchors.map((anchor) => anchor.href).filter(Boolean))];
  });
}

async function visibleArchiveImageRect(page) {
  const images = await page.locator('img[src*="/archive/"]').evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          height: rect.height,
          src: node.src,
          visible:
            rect.width > 80 &&
            rect.height > 80 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((node) => node.visible)
      .sort((left, right) => right.width * right.height - left.width * left.height),
  );

  return images[0] ?? null;
}

async function captureGoogleCreative({ competitor, page, root, sourceUrl }) {
  const creativeId = parseCreativeId(sourceUrl);
  if (!creativeId) return null;

  await page.goto(sourceUrl, { timeout: 45_000, waitUntil: "domcontentloaded" });
  await page
    .waitForFunction(
      () =>
        /Ad details|Last shown|Format:/iu.test(document.body?.innerText ?? "") ||
        document.querySelector('img[src*="/archive/"]'),
      { timeout: 18_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1_000);

  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  if (
    /429\.\s*that's an error|server cannot process the request|unusual traffic|access denied/iu.test(
      bodyText,
    )
  ) {
    return null;
  }

  const detail = parseGoogleDetailText(bodyText);
  const paths = evidencePaths({
    filename: `google-${creativeId}.png`,
    root,
    slug: competitor.slug,
  });
  const imageRect = await visibleArchiveImageRect(page);
  const viewport = page.viewportSize() ?? { height: 1100, width: 1440 };
  const clip = imageRect
    ? {
        height: Math.max(420, Math.min(980, imageRect.y + imageRect.height - 160 + 80)),
        width: Math.min(1120, viewport.width),
        x: 0,
        y: 160,
      }
    : null;
  let ocrLines = [];

  try {
    await ensureEvidenceDirs(paths);
    await page.screenshot({
      fullPage: !clip,
        path: paths.screenshotRawFilePath,
        ...(clip ? { clip } : {}),
      });
      await copyRawToPublic(paths);
    ocrLines = await ocrImageWithVision(paths.screenshotRawFilePath);
  } catch (error) {
    const text = headlineFromOcrLines(ocrLines);
    return {
      ...detail,
      ...text,
      caveat:
        "Google Ads Transparency Center exposed a public creative, but screenshot capture failed: " +
        (error instanceof Error ? error.message : String(error)),
      creativeId,
      screenshotPath: null,
      screenshotRawPath: null,
      sourceUrl,
    };
  }

  const text = headlineFromOcrLines(ocrLines);

  return {
    ...detail,
    ...text,
    caveat: text.headline ? null : "Creative text is visible in the screenshot but was not exposed as DOM text.",
    creativeId,
    screenshotPath: paths.screenshotPath,
    screenshotRawPath: paths.screenshotRawPath,
    sourceUrl,
  };
}

async function captureGooglePages({ browser, competitors, delayMs, root }) {
  const context = await browser.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 xpat-os/0.1",
    viewport: { width: 1440, height: 1100 },
  });
  const results = new Map();

  for (const competitor of competitors) {
    const searchPage = await context.newPage();
    const detailPage = await context.newPage();
    const searches = googleSearchesFor(competitor);
    const cards = [];
    const bodies = [];

    try {
      for (const search of searches) {
        if (cards.length >= MAX_ADS_PER_COMPETITOR) break;

        await searchPage.goto(search.url, { timeout: 45_000, waitUntil: "domcontentloaded" });
        await searchPage.waitForTimeout(delayMs);
        const bodyText = await searchPage.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
        bodies.push(bodyText);
        const links = await collectCreativeLinks(searchPage);

        for (const sourceUrl of links) {
          if (cards.length >= MAX_ADS_PER_COMPETITOR) break;
          if (cards.some((card) => card.creativeId === parseCreativeId(sourceUrl))) continue;

          const card = await captureGoogleCreative({
            competitor,
            page: detailPage,
            root,
            sourceUrl,
          });

          if (card) cards.push(card);
        }
      }

      results.set(competitor.competitor, {
        bodyText: bodies.join("\n"),
        cards,
        sourceUrl: searches[0].url,
      });
    } catch (error) {
      results.set(competitor.competitor, {
        bodyText: bodies.join("\n"),
        cards,
        caveat:
          "Google Ads Transparency Center did not expose public ad cards to this browser run: " +
          (error instanceof Error ? error.message : String(error)),
        sourceUrl: searches[0].url,
      });
    } finally {
      await searchPage.close().catch(() => {});
      await detailPage.close().catch(() => {});
    }
  }

  await context.close();
  return results;
}

export async function runGoogleAds({
  capturedAt = new Date().toISOString(),
  competitors = competitorProfiles,
  delayMs = 1_500,
  root = process.cwd(),
} = {}) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });

  try {
    const pageResults = await captureGooglePages({ browser, competitors, delayMs, root });
    return buildGoogleAdRecords({ capturedAt, competitors, pageResults });
  } finally {
    await browser.close().catch(() => {});
  }
}
