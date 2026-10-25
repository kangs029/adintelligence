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

const META_AD_LIBRARY_BASE = "https://www.facebook.com/ads/library/";

export function metaAdLibraryUrl({ query }) {
  const url = new URL(META_AD_LIBRARY_BASE);
  url.searchParams.set("active_status", "active");
  url.searchParams.set("ad_type", "all");
  url.searchParams.set("country", "US");
  url.searchParams.set("media_type", "all");
  url.searchParams.set("q", query);
  url.searchParams.set("search_type", "keyword_unordered");
  return url.toString();
}

function metaAdLibraryCardUrl(libraryId) {
  const url = new URL(META_AD_LIBRARY_BASE);
  url.searchParams.set("id", libraryId);
  return url.toString();
}

function metaQueriesFor(competitor) {
  return competitor.metaQueries?.length ? competitor.metaQueries : [competitor.query];
}

export function classifyMetaAdPage(bodyText) {
  const text = cleanText(bodyText).toLowerCase();

  if (/no ads match|no results|couldn't find any ads|could not find any ads/u.test(text)) {
    return {
      caveat: "Meta Ad Library returned no active public ad cards for this query.",
      status: "no-public-ads-captured",
    };
  }

  if (
    /log into facebook to start|log in to facebook to start|you must log in|temporarily blocked/u.test(
      text,
    )
  ) {
    return {
      caveat: "Meta Ad Library did not expose public ad cards without an authenticated session.",
      status: "blocked",
    };
  }

  if (
    /library id|ad details|started running|active platforms|this ad started|sponsored/u.test(text)
  ) {
    return { caveat: null, status: "snapshot" };
  }

  return {
    caveat: "Meta Ad Library public page loaded, but no parseable ad card text was exposed.",
    status: "no-public-ads-captured",
  };
}

function splitLines(text) {
  return String(text ?? "")
    .split(/\r?\n/u)
    .map(cleanText)
    .filter(Boolean);
}

function metaAdvertiserNames(competitor) {
  return competitor.metaAdvertiserNames?.length
    ? competitor.metaAdvertiserNames
    : [competitor.competitor];
}

function matchesAdvertiser(text, competitor) {
  const lines = splitLines(text);
  const names = metaAdvertiserNames(competitor).map((name) => cleanText(name).toLowerCase());

  return lines.some((line, index) => {
    const current = line.toLowerCase();
    const next = lines[index + 1]?.toLowerCase();
    return names.includes(current) && next === "sponsored";
  });
}

function firstAdTextLine(text) {
  const lines = splitLines(text);
  const sponsoredIndex = lines.findIndex((line) => /^sponsored$/iu.test(line));
  const candidateLines = sponsoredIndex >= 0 ? lines.slice(sponsoredIndex + 1) : lines;
  const blocked = [
    /^(active|inactive)$/iu,
    /^library id:/iu,
    /^started running on/iu,
    /^see (ad|summary) details$/iu,
    /^sponsored$/iu,
    /^paid for by/iu,
    /^this ad has multiple versions/iu,
    /^about this ad/iu,
    /^active platforms$/iu,
    /^facebook$/iu,
    /^instagram$/iu,
    /^messenger$/iu,
    /^audience network$/iu,
    /^(learn more|send message|shop now|sign up|install now|download)$/iu,
  ];

  return (
    candidateLines
      .filter((line) => line.length >= 8)
      .find((line) => !blocked.some((pattern) => pattern.test(line)))?.slice(0, 180) ?? null
  );
}

function parseMetaCard(card) {
  const lines = splitLines(card.text);
  const libraryId =
    card.libraryId ??
    lines
      .map((line) => line.match(/Library ID:\s*([0-9]+)/iu)?.[1])
      .find(Boolean) ??
    null;
  const firstSeenRaw =
    lines
      .map((line) => line.match(/^Started running on\s+(.+)$/iu)?.[1])
      .find(Boolean) ?? null;
  const placement =
    lines
      .map((line) => line.match(/^Active platforms\s+(.+)$/iu)?.[1])
      .find(Boolean) ?? null;
  const headline = sanitizeAdDisplayText(firstAdTextLine(card.text));

  return {
    ...card,
    bodyText: headline,
    firstSeen: parseEnglishDateToIso(firstSeenRaw),
    headline,
    libraryId,
    mediaType: null,
    placement,
    sourceUrl: libraryId ? metaAdLibraryCardUrl(libraryId) : card.sourceUrl,
  };
}

function buildNoCaptureMetaRecord({ capturedAt, caveat, competitor, sourceUrl, status }) {
  return {
    bodyText: null,
    capturedAt,
    caveat,
    competitor: competitor.competitor,
    firstSeen: null,
    headline: null,
    id: `meta-${competitor.slug}-${dateStamp(capturedAt)}`,
    mediaType: null,
    placement: null,
    platform: "Meta",
    screenshotPath: null,
    screenshotRawPath: null,
    sourceUrl,
    status,
    themes: [],
  };
}

export function buildMetaAdRecords({ capturedAt, competitors = competitorProfiles, pageResults }) {
  return competitors.flatMap((competitor) => {
    const result = pageResults.get(competitor.competitor) ?? {};
    const sourceUrl = result.sourceUrl ?? metaAdLibraryUrl({ query: metaQueriesFor(competitor)[0] });
    const parsedCards = uniqueBy(
      (result.cards ?? [])
        .filter((card) => matchesAdvertiser(card.text ?? "", competitor))
        .map(parseMetaCard),
      (card) => card.libraryId,
    ).slice(0, MAX_ADS_PER_COMPETITOR);

    if (parsedCards.length > 0) {
      return parsedCards.map((card) => ({
        bodyText: card.bodyText,
        capturedAt,
        caveat: card.screenshotPath
          ? null
          : "Meta Ad Library exposed a public card, but the screenshot capture failed.",
        competitor: competitor.competitor,
        firstSeen: card.firstSeen,
        headline: card.headline,
        id: `meta-${competitor.slug}-${card.libraryId}`,
        mediaType: card.mediaType,
        placement: card.placement,
        platform: "Meta",
        screenshotPath: card.screenshotPath ?? null,
        screenshotRawPath: card.screenshotRawPath ?? null,
        sourceUrl: card.sourceUrl,
        status: "snapshot",
        themes: [],
      }));
    }

    const classification = classifyMetaAdPage(result.bodyText ?? "");

    return [
      buildNoCaptureMetaRecord({
        capturedAt,
        caveat:
          result.caveat ??
          (classification.status === "snapshot"
            ? /Library ID:/iu.test(result.bodyText ?? "")
              ? "Meta Ad Library returned public cards, but none matched the reviewed advertiser names for this competitor."
              : "Meta Ad Library public page loaded, but no parseable ad card text was exposed."
            : classification.caveat),
        competitor,
        sourceUrl,
        status: classification.status === "snapshot" ? "no-public-ads-captured" : classification.status,
      }),
    ];
  });
}

async function markMetaCards(page) {
  return page.evaluate(() => {
    const marker = "data-xpat-ad-card";
    document.querySelectorAll(`[${marker}]`).forEach((element) => element.removeAttribute(marker));

    const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      if (/Library ID:\s*[0-9]+/iu.test(walker.currentNode.nodeValue ?? "")) {
        textNodes.push(walker.currentNode);
      }
    }

    const seen = new Set();
    const cards = [];

    for (const node of textNodes) {
      const libraryId = node.nodeValue?.match(/Library ID:\s*([0-9]+)/iu)?.[1];
      if (!libraryId || seen.has(libraryId)) continue;

      let selected = null;
      let element = node.parentElement;

      while (element && element !== document.body) {
        const text = element.innerText ?? "";
        const rect = element.getBoundingClientRect();
        const hasCardText =
          /Library ID:\s*[0-9]+/iu.test(text) &&
          /Started running on/iu.test(text) &&
          /Sponsored/iu.test(text);
        const plausibleRect =
          rect.width >= 260 && rect.width <= 760 && rect.height >= 220 && rect.height <= 1400;

        if (hasCardText && plausibleRect) {
          selected = element;
          break;
        }

        element = element.parentElement;
      }

      if (!selected) continue;

      selected.setAttribute(marker, libraryId);
      seen.add(libraryId);

      const rect = selected.getBoundingClientRect();
      cards.push({
        libraryId,
        rect: {
          height: Math.round(rect.height),
          width: Math.round(rect.width),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        },
        text: selected.innerText,
        textPreview: clean(selected.innerText).slice(0, 240),
      });
    }

    return cards;
  });
}

async function captureMetaCardsForQuery({ competitor, delayMs, page, query, remaining, root }) {
  const sourceUrl = metaAdLibraryUrl({ query });
  const cards = [];

  await page.goto(sourceUrl, { timeout: 45_000, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(delayMs);
  await page
    .waitForFunction(
      () =>
        /Library ID:|No ads match|No results|Log into Facebook|temporarily blocked/iu.test(
          document.body?.innerText ?? "",
        ),
      { timeout: 12_000 },
    )
    .catch(() => {});

  const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const markedCards = (await markMetaCards(page)).filter((card) =>
    matchesAdvertiser(card.text ?? "", competitor),
  );

  for (const card of uniqueBy(markedCards, (item) => item.libraryId).slice(0, remaining)) {
    const parsed = parseMetaCard({ ...card, sourceUrl });
    const paths = evidencePaths({
      filename: `meta-${parsed.libraryId}.png`,
      root,
      slug: competitor.slug,
    });

    try {
      const locator = page.locator(`[data-xpat-ad-card="${parsed.libraryId}"]`).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
      await ensureEvidenceDirs(paths);
      await locator.screenshot({ path: paths.screenshotRawFilePath, timeout: 20_000 });
      await copyRawToPublic(paths);
      cards.push({ ...parsed, ...paths });
    } catch (error) {
      cards.push({
        ...parsed,
        screenshotError: error instanceof Error ? error.message : String(error),
        screenshotPath: null,
        screenshotRawPath: null,
      });
    }
  }

  return { bodyText, cards, sourceUrl };
}

async function captureMetaPages({ browser, competitors, delayMs, root }) {
  const context = await browser.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 xpat-os/0.1",
    viewport: { width: 1440, height: 1100 },
  });
  const results = new Map();

  for (const competitor of competitors) {
    const page = await context.newPage();
    const queryResults = [];
    const cards = [];

    try {
      for (const query of metaQueriesFor(competitor)) {
        if (cards.length >= MAX_ADS_PER_COMPETITOR) break;

        const result = await captureMetaCardsForQuery({
          competitor,
          delayMs,
          page,
          query,
          remaining: MAX_ADS_PER_COMPETITOR - cards.length,
          root,
        });

        queryResults.push(result);
        cards.push(...result.cards);
      }

      const sourceUrl = queryResults[0]?.sourceUrl ?? metaAdLibraryUrl({ query: competitor.query });
      const bodyText = queryResults.map((result) => result.bodyText).join("\n");
      const unfilteredCardCount = queryResults.reduce(
        (sum, result) => sum + (result.bodyText.match(/Library ID:/giu)?.length ?? 0),
        0,
      );

      results.set(competitor.competitor, {
        bodyText,
        cards: uniqueBy(cards, (card) => card.libraryId),
        caveat:
          unfilteredCardCount > 0 && cards.length === 0
            ? "Meta Ad Library returned cards, but none matched the reviewed advertiser names for this competitor."
            : null,
        sourceUrl,
      });
    } catch (error) {
      results.set(competitor.competitor, {
        bodyText: "",
        cards,
        caveat:
          "Meta Ad Library did not expose public ad cards to this browser run: " +
          (error instanceof Error ? error.message : String(error)),
        sourceUrl: metaAdLibraryUrl({ query: metaQueriesFor(competitor)[0] }),
      });
    } finally {
      await page.close().catch(() => {});
    }
  }

  await context.close();
  return results;
}

export async function runMetaAds({
  capturedAt = new Date().toISOString(),
  competitors = competitorProfiles,
  delayMs = 1_500,
  root = process.cwd(),
} = {}) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });

  try {
    const pageResults = await captureMetaPages({ browser, competitors, delayMs, root });
    return buildMetaAdRecords({ capturedAt, competitors, pageResults });
  } finally {
    await browser.close().catch(() => {});
  }
}
