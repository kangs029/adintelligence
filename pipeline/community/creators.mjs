import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeDeterministicJson } from "../lib/provenance.mjs";
import { dailyGeneratedAt } from "./threads.mjs";

const ARTIFACT_FILE = join("data", "artifacts", "creators.json");
const QUERY_FILE = join("pipeline", "community", "creator-queries.json");
const OVERLAY_FILE = join("data", "curation", "creator-fit-notes.json");
const BASE_URL = "https://www.googleapis.com/youtube/v3";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  return readJson(path);
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function numeric(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function youtubeUrl(resource, params) {
  const url = new URL(`${BASE_URL}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function normalizeCreator({ capturedAt, channel, videos = [] }) {
  const channelId = channel.id;

  return {
    audienceFitNote: "Curated audience-fit note needed.",
    capturedAt,
    channelId,
    name: cleanText(channel.snippet?.title),
    recentRelevantVideos: videos.slice(0, 2).map((video) => ({
      publishedAt: video.snippet?.publishedAt,
      title: cleanText(video.snippet?.title),
      url: `https://www.youtube.com/watch?v=${video.id}`,
      views: numeric(video.statistics?.viewCount),
    })),
    subscriberCount: numeric(channel.statistics?.subscriberCount),
    url: `https://www.youtube.com/channel/${channelId}`,
  };
}

export function mergeCreatorOverlay(creators, overlay = []) {
  const byChannel = new Map(overlay.map((item) => [item.channelId, item]));

  return creators.map((creator) => ({
    ...creator,
    audienceFitNote: byChannel.get(creator.channelId)?.audienceFitNote ?? creator.audienceFitNote,
  }));
}

function dedupeCreators(creators) {
  const byChannel = new Map();
  for (const creator of creators) {
    if (!byChannel.has(creator.channelId)) {
      byChannel.set(creator.channelId, creator);
    }
  }
  return [...byChannel.values()].sort((left, right) => right.subscriberCount - left.subscriberCount);
}

export function buildCreatorsArtifact({
  creators,
  generatedAt = dailyGeneratedAt(),
  status = "ok",
  sweepErrors = [],
}) {
  const blocked = status !== "ok";

  return {
    meta: {
      caveats: [
        "Public channels with audience overlap. No outreach has occurred, no pricing is implied.",
        "Subscriber counts are rounded public YouTube values.",
        "Audience-fit notes require curated human review.",
      ],
      family: "creators",
      generatedAt,
      method:
        "YouTube Data API v3 search, channels.list, and videos.list when YouTube API access is configured; curated overlay merges audience-fit notes.",
      provenance: blocked ? "connector-needed" : "snapshot",
      refreshCadence: "weekly manual sweep",
      source: "YouTube Data API v3",
      version: 1,
    },
    data: {
      creators: dedupeCreators(creators),
      status,
      sweepErrors,
    },
  };
}

async function readJsonResponse(response, label) {
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return response.json();
}

async function fetchSearchChannels({ apiKey, fetchImpl, query }) {
  const json = await readJsonResponse(
    await fetchImpl(
      youtubeUrl("search", {
        key: apiKey,
        maxResults: "5",
        order: "relevance",
        part: "snippet",
        q: query,
        type: "channel",
      }),
    ),
    `YouTube channel search for ${query}`,
  );

  return (json.items ?? []).map((item) => item.id?.channelId).filter(Boolean);
}

async function fetchChannels({ apiKey, channelIds, fetchImpl }) {
  if (channelIds.length === 0) return [];

  const json = await readJsonResponse(
    await fetchImpl(
      youtubeUrl("channels", {
        id: channelIds.join(","),
        key: apiKey,
        part: "snippet,statistics",
      }),
    ),
    "YouTube channels.list",
  );

  return json.items ?? [];
}

async function fetchRecentVideos({ apiKey, channelId, fetchImpl }) {
  const searchJson = await readJsonResponse(
    await fetchImpl(
      youtubeUrl("search", {
        channelId,
        key: apiKey,
        maxResults: "2",
        order: "date",
        part: "snippet",
        q: "India money finance remittance",
        type: "video",
      }),
    ),
    `YouTube video search for ${channelId}`,
  );
  const videoIds = (searchJson.items ?? []).map((item) => item.id?.videoId).filter(Boolean);
  if (videoIds.length === 0) return [];

  const videosJson = await readJsonResponse(
    await fetchImpl(
      youtubeUrl("videos", {
        id: videoIds.join(","),
        key: apiKey,
        part: "snippet,statistics",
      }),
    ),
    `YouTube videos.list for ${channelId}`,
  );

  return videosJson.items ?? [];
}

export async function runCreators({
  apiKey = process.env.YOUTUBE_API_KEY,
  fetchImpl = fetch,
  generatedAt = process.env.PIPELINE_GENERATED_AT ?? dailyGeneratedAt(),
  root = process.cwd(),
} = {}) {
  const artifactPath = join(root, ARTIFACT_FILE);
  const overlay = readJsonIfExists(join(root, OVERLAY_FILE))?.overrides ?? [];

  if (!apiKey) {
    const artifact = buildCreatorsArtifact({
      creators: [],
      generatedAt,
      status: "connector-needed",
      sweepErrors: [{ message: "YouTube API access is not configured." }],
    });
    await writeDeterministicJson(artifactPath, artifact);
    return artifact;
  }

  const queryConfig = readJson(join(root, QUERY_FILE));
  const channelIds = new Set();
  const errors = [];

  for (const query of queryConfig.queries) {
    try {
      for (const channelId of await fetchSearchChannels({ apiKey, fetchImpl, query })) {
        channelIds.add(channelId);
      }
    } catch (error) {
      errors.push({ message: error instanceof Error ? error.message : String(error), query });
    }
  }

  const channels = await fetchChannels({ apiKey, channelIds: [...channelIds].slice(0, 20), fetchImpl });
  const creators = [];

  for (const channel of channels) {
    try {
      const videos = await fetchRecentVideos({ apiKey, channelId: channel.id, fetchImpl });
      creators.push(normalizeCreator({ capturedAt: generatedAt, channel, videos }));
    } catch (error) {
      errors.push({ channelId: channel.id, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const artifact = buildCreatorsArtifact({
    creators: mergeCreatorOverlay(creators, overlay),
    generatedAt,
    status: creators.length === 0 ? "connector-needed" : "ok",
    sweepErrors: errors,
  });

  await writeDeterministicJson(artifactPath, artifact);
  return artifact;
}
