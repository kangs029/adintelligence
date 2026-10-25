import { describe, expect, it } from "vitest";

import {
  buildGoogleArtifact,
  fetchGoogleAdsData,
  normalizeGoogleRecord,
  runGooglePerformance,
} from "./google-performance.mjs";

const SAMPLE_ROW = {
  campaign: {
    id: "12345678901",
    name: "XPAT_US_NRI_Search_2026",
    status: "ENABLED",
    advertisingChannelType: "SEARCH",
  },
  adGroup: {
    id: "98765432101",
    name: "NRI_Dallas_Lookalike",
  },
  metrics: {
    impressions: "4523",
    clicks: "182",
    costMicros: "18500000",
    ctr: "0.0402",
    averageCpc: "101650",
    averageCpm: "4090000",
    conversions: "4.0",
    costPerConversion: "4625000",
  },
  segments: {
    date: "2026-08-13",
  },
};

const TOKEN_RESPONSE = {
  access_token: "ya29.fake-access-token",
  expires_in: 3599,
  token_type: "Bearer",
};

describe("google-performance pipeline", () => {
  it("normalizes a Google Ads row into a typed AdPerformanceRecord", () => {
    const record = normalizeGoogleRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: SAMPLE_ROW,
    });

    expect(record).toMatchObject({
      platform: "Google",
      campaignId: "12345678901",
      campaignName: "XPAT_US_NRI_Search_2026",
      adSetId: "98765432101",
      adSetName: "NRI_Dallas_Lookalike",
      spendUsd: 18.5,
      impressions: 4523,
      clicks: 182,
      ctr: 4.02,
      cpc: 0.1,
      cpm: 4.09,
      conversions: 4,
      cpa: 4.63,
      date: "2026-08-13",
      status: "ACTIVE",
      capturedAt: "2026-08-13T14:00:00.000Z",
      geoId: null,
      geoName: null,
      objective: "SEARCH",
    });
  });

  it("converts PAUSED campaign status correctly", () => {
    const record = normalizeGoogleRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, campaign: { ...SAMPLE_ROW.campaign, status: "PAUSED" } },
    });
    expect(record?.status).toBe("PAUSED");
  });

  it("returns undefined for rows with no campaign id", () => {
    const record = normalizeGoogleRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, campaign: { ...SAMPLE_ROW.campaign, id: "" } },
    });
    expect(record).toBeUndefined();
  });

  it("returns undefined for rows with no date", () => {
    const record = normalizeGoogleRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, segments: { date: "" } },
    });
    expect(record).toBeUndefined();
  });

  it("converts cost_micros to dollars correctly", () => {
    const record = normalizeGoogleRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, metrics: { ...SAMPLE_ROW.metrics, costMicros: "1000000" } },
    });
    expect(record?.spendUsd).toBe(1.0);
  });

  it("builds a valid artifact with correct meta envelope", () => {
    const artifact = buildGoogleArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      customerId: "2329750396",
      errors: [],
      records: [normalizeGoogleRecord({ capturedAt: "2026-08-13T14:00:00.000Z", row: SAMPLE_ROW })],
      status: "ok",
    });

    expect(artifact.meta.family).toBe("google-ad-performance");
    expect(artifact.meta.provenance).toBe("live");
    expect(artifact.meta.version).toBe(1);
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.recordCount).toBe(1);
    expect(artifact.data.customerId).toBe("2329750396");
  });

  it("marks artifact as connector-needed when status is blocked", () => {
    const artifact = buildGoogleArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      customerId: "unknown",
      errors: [{ message: "GOOGLE_ADS_REFRESH_TOKEN is not configured." }],
      records: [],
      status: "blocked",
    });
    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
  });

  it("returns blocked status when developer token is missing", async () => {
    const result = await fetchGoogleAdsData({
      developerToken: "",
      customerId: "2329750396",
    });
    expect(result.status).toBe("blocked");
    expect(result.errors[0].message).toContain("GOOGLE_ADS_DEVELOPER_TOKEN");
  });

  it("returns blocked status when refresh token is missing", async () => {
    const result = await fetchGoogleAdsData({
      developerToken: "dev-token",
      customerId: "2329750396",
      refreshToken: "",
      accessToken: undefined,
    });
    expect(result.status).toBe("blocked");
    expect(result.errors[0].message).toContain("GOOGLE_ADS_REFRESH_TOKEN");
  });

  it("fetches access token then calls Google Ads API", async () => {
    const calls = [];
    const result = await fetchGoogleAdsData({
      developerToken: "dev-token",
      customerId: "2329750396",
      refreshToken: "1//fake-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        calls.push(String(url));
        if (String(url).includes("oauth2.googleapis.com/token")) {
          return Response.json(TOKEN_RESPONSE);
        }
        return Response.json({ results: [SAMPLE_ROW], nextPageToken: null });
      },
    });

    expect(calls.filter((url) => url.includes("oauth2.googleapis.com"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("googleads.googleapis.com"))).toHaveLength(1);
    expect(result.status).toBe("ok");
    expect(result.rows).toHaveLength(1);
  });

  it("reuses provided accessToken without calling token endpoint", async () => {
    const calls = [];
    const result = await fetchGoogleAdsData({
      accessToken: "ya29.already-have-token",
      developerToken: "dev-token",
      customerId: "2329750396",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return Response.json({ results: [SAMPLE_ROW] });
      },
    });

    expect(calls.filter((url) => url.includes("oauth2.googleapis.com"))).toHaveLength(0);
    expect(result.status).toBe("ok");
  });

  it("paginates through multiple pages", async () => {
    let page = 0;
    const result = await fetchGoogleAdsData({
      accessToken: "ya29.token",
      developerToken: "dev-token",
      customerId: "2329750396",
      fetchImpl: async () => {
        page += 1;
        if (page === 1) {
          return Response.json({
            results: [SAMPLE_ROW],
            nextPageToken: "page-2-token",
          });
        }
        return Response.json({
          results: [{ ...SAMPLE_ROW, campaign: { ...SAMPLE_ROW.campaign, id: "99999" } }],
          nextPageToken: null,
        });
      },
    });

    expect(result.status).toBe("ok");
    expect(result.rows).toHaveLength(2);
  });

  it("runGooglePerformance returns blocked artifact when credentials are missing", async () => {
    const artifact = await runGooglePerformance({
      developerToken: "",
      customerId: "",
      capturedAt: "2026-08-13T14:00:00.000Z",
    });
    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
  });

  it("runGooglePerformance returns live artifact with normalized records", async () => {
    const artifact = await runGooglePerformance({
      accessToken: "ya29.token",
      developerToken: "dev-token",
      customerId: "2329750396",
      capturedAt: "2026-08-13T14:00:00.000Z",
      fetchImpl: async () => Response.json({ results: [SAMPLE_ROW] }),
    });

    expect(artifact.meta.provenance).toBe("live");
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.records.length).toBe(1);
    expect(artifact.data.records[0].platform).toBe("Google");
    expect(artifact.data.records[0].spendUsd).toBe(18.5);
  });
});
