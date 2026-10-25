import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const APP_CONFIG_FILE = join("pipeline", "competitors", "review-apps.json");

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function label(value) {
  return value?.label ?? null;
}

function parseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function appleReviewsUrl({ appId, country = "us", page = 1 }) {
  return `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
}

export function normalizeAppleReviewEntry({ appId, competitor, entry }) {
  const rating = Number(label(entry["im:rating"]));
  const text = cleanText(label(entry.content));
  const date = parseDate(label(entry.updated));

  if (!Number.isFinite(rating) || !text || !date) return undefined;

  return {
    appId,
    author: cleanText(label(entry.author?.name)),
    competitor,
    date,
    id: cleanText(label(entry.id)) || `${appId}-${date}-${text.slice(0, 24)}`,
    rating,
    store: "ios",
    text,
    title: cleanText(label(entry.title)),
    url: entry.link?.attributes?.href ?? null,
    version: cleanText(label(entry["im:version"])),
  };
}

export function normalizeGoogleReview({ appId, competitor, review }) {
  const rating = Number(review.score);
  const text = cleanText(review.text);
  const date = parseDate(review.date);

  if (!Number.isFinite(rating) || !text || !date) return undefined;

  return {
    appId,
    author: cleanText(review.userName),
    competitor,
    date,
    id: cleanText(review.id) || `${appId}-${date}-${text.slice(0, 24)}`,
    rating,
    store: "android",
    text,
    title: cleanText(review.title),
    url: review.url ?? null,
    version: cleanText(review.version),
  };
}

async function readJsonResponse(response, labelText) {
  if (!response.ok) {
    throw new Error(`${labelText} returned HTTP ${response.status}.`);
  }

  return response.json();
}

async function fetchAppleReviewsForApp({
  app,
  country,
  delayMs,
  fetchImpl,
  maxPages,
}) {
  const reviews = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = appleReviewsUrl({ appId: app.ios.appId, country, page });
    const json = await readJsonResponse(
      await fetchImpl(url, { headers: { "user-agent": "xpat-os/0.1" } }),
      `${app.competitor} Apple reviews page ${page}`,
    );
    const entries = Array.isArray(json.feed?.entry) ? json.feed.entry : [];
    const pageReviews = entries
      .map((entry) =>
        normalizeAppleReviewEntry({
          appId: app.ios.appId,
          competitor: app.competitor,
          entry,
        }),
      )
      .filter(Boolean);

    if (pageReviews.length === 0) break;
    reviews.push(...pageReviews);
    await sleep(delayMs);
  }

  return reviews;
}

async function fetchGoogleReviewsForApp({ app, country, lang, limit }) {
  const gps = (await import("google-play-scraper")).default;
  const response = await gps.reviews({
    appId: app.android.appId,
    country,
    lang,
    num: limit,
    sort: gps.sort.NEWEST,
  });

  return (response.data ?? [])
    .map((review) =>
      normalizeGoogleReview({
        appId: app.android.appId,
        competitor: app.competitor,
        review,
      }),
    )
    .filter(Boolean);
}

function dedupeReviews(reviews) {
  const byId = new Map();
  for (const review of reviews) {
    byId.set(`${review.store}:${review.id}`, review);
  }
  return [...byId.values()].sort((left, right) => right.date.localeCompare(left.date));
}

export function buildReviewsArtifact({ generatedAt = new Date().toISOString(), reviews }) {
  return {
    meta: {
      caveats: [
        "Public reviews are user-authored source excerpts and do not prove funnel performance.",
        "Store APIs can return different recent windows by country, language, and availability.",
      ],
      family: "reviews",
      generatedAt,
      method:
        "Apple public customer-review RSS and google-play-scraper most-recent Android review pulls. Raw review text is kept in data/raw/reviews for the classifier.",
      provenance: "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "Apple customer review RSS, Google Play via google-play-scraper",
      version: 1,
    },
    data: {
      reviews: dedupeReviews(reviews),
    },
  };
}

export async function runReviews({
  appleMaxPages = 10,
  delayMs = 400,
  generatedAt = new Date().toISOString(),
  googleLimit = 500,
  root = process.cwd(),
} = {}) {
  const config = readJsonIfExists(join(root, APP_CONFIG_FILE));
  const reviews = [];
  const errors = [];

  for (const app of config.apps) {
    try {
      reviews.push(
        ...(await fetchAppleReviewsForApp({
          app,
          country: config.country,
          delayMs,
          fetchImpl: fetch,
          maxPages: appleMaxPages,
        })),
      );
    } catch (error) {
      errors.push({
        competitor: app.competitor,
        message: error instanceof Error ? error.message : String(error),
        store: "ios",
      });
    }

    try {
      reviews.push(
        ...(await fetchGoogleReviewsForApp({
          app,
          country: config.country,
          lang: config.lang,
          limit: googleLimit,
        })),
      );
    } catch (error) {
      errors.push({
        competitor: app.competitor,
        message: error instanceof Error ? error.message : String(error),
        store: "android",
      });
    }
  }

  const artifact = buildReviewsArtifact({ generatedAt, reviews });
  if (errors.length > 0) {
    artifact.data.errors = errors;
  }

  const rawDir = join(root, "data", "raw", "reviews");
  await mkdir(rawDir, { recursive: true });
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(join(rawDir, `reviews-${generatedAt.slice(0, 10)}.json`), json, "utf8");
  await writeFile(join(rawDir, "latest.json"), json, "utf8");
  return artifact;
}
