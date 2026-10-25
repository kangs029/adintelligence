import { describe, expect, it } from "vitest";

import {
  buildCreatorsArtifact,
  mergeCreatorOverlay,
  normalizeCreator,
  youtubeUrl,
} from "./creators.mjs";

describe("YouTube creator pipeline", () => {
  it("builds YouTube Data API URLs with the API key and query params", () => {
    const url = new URL(
      youtubeUrl("search", {
        key: "test-key",
        maxResults: "5",
        part: "snippet",
        q: "NRI finance",
        type: "channel",
      }),
    );

    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.pathname).toBe("/youtube/v3/search");
    expect(url.searchParams.get("q")).toBe("NRI finance");
    expect(url.searchParams.get("type")).toBe("channel");
    expect(url.searchParams.get("key")).toBe("test-key");
  });

  it("normalizes channel statistics and relevant videos into creator records", () => {
    const creator = normalizeCreator({
      capturedAt: "2026-07-03T00:00:00.000Z",
      channel: {
        id: "UC123",
        snippet: { title: "NRI Money" },
        statistics: { subscriberCount: "120000" },
      },
      videos: [
        {
          id: "v1",
          snippet: {
            publishedAt: "2026-06-20T00:00:00.000Z",
            title: "Sending money to India",
          },
          statistics: { viewCount: "4500" },
        },
      ],
    });

    expect(creator).toEqual({
      audienceFitNote: "Curated audience-fit note needed.",
      capturedAt: "2026-07-03T00:00:00.000Z",
      channelId: "UC123",
      name: "NRI Money",
      recentRelevantVideos: [
        {
          publishedAt: "2026-06-20T00:00:00.000Z",
          title: "Sending money to India",
          url: "https://www.youtube.com/watch?v=v1",
          views: 4500,
        },
      ],
      subscriberCount: 120000,
      url: "https://www.youtube.com/channel/UC123",
    });
  });

  it("merges curated audience-fit notes by channelId", () => {
    expect(
      mergeCreatorOverlay(
        [
          {
            audienceFitNote: "Curated audience-fit note needed.",
            channelId: "UC123",
          },
        ],
        [{ audienceFitNote: "Telugu US finance audience.", channelId: "UC123" }],
      )[0],
    ).toMatchObject({
      audienceFitNote: "Telugu US finance audience.",
    });
  });

  it("keeps missing YouTube API keys explicit instead of inventing creators", () => {
    const artifact = buildCreatorsArtifact({
      creators: [],
      generatedAt: "2026-07-03T00:00:00.000Z",
      status: "connector-needed",
      sweepErrors: [{ message: "YOUTUBE_API_KEY is not configured." }],
    });

    expect(artifact.meta).toMatchObject({
      family: "creators",
      provenance: "connector-needed",
    });
    expect(artifact.data).toMatchObject({
      creators: [],
      status: "connector-needed",
    });
  });
});
