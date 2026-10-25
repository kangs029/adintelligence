import { describe, expect, it } from "vitest";

import {
  buildMetaArtifact,
  fetchMetaInsights,
  metaInsightsUrl,
  normalizeMetaRecord,
  runMetaPerformance,
} from "./meta-performance.mjs";

const SAMPLE_ROW = {
  campaign_id: "23851234567890",
  campaign_name: "XPAT_US_NRI_Search_2026",
  adset_id: "23851234567891",
  adset_name: "NRI_Dallas_Lookalike",
  spend: "18.50",
  impressions: "4523",
  clicks: "182",
  reach: "3800",
  ctr: "4.02",
  cpc: "0.10",
  cpm: "4.09",
  objective: "OUTCOME_TRAFFIC",
  date_start: "2026-08-13",
  date_stop: "2026-08-13",
  actions: [{ action_type: "offsite_conversion", value: "4" }],
  cost_per_action_type: [{ action_type: "offsite_conversion", value: "4.63" }],
};

describe("meta-performance pipeline", () => {
  it("builds correct insights URL with all required params", () => {
    const url = new URL(
      metaInsightsUrl({ adAccountId: "act_123456789", datePreset: "last_30d" }),
    );
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v20.0/act_123456789/insights");
    expect(url.searchParams.get("level")).toBe("adset");
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(url.searchParams.get("date_preset")).toBe("last_30d");
  });

  it("normalizes a Meta insights row into a typed AdPerformanceRecord", () => {
    const record = normalizeMetaRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: SAMPLE_ROW,
    });

    expect(record).toMatchObject({
      platform: "Meta",
      campaignId: "23851234567890",
      campaignName: "XPAT_US_NRI_Search_2026",
      adSetId: "23851234567891",
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
      capturedAt: "2026-08-13T14:00:00.000Z",
      geoId: null,
      geoName: null,
    });
  });

  it("returns undefined for rows with no campaign_id", () => {
    const record = normalizeMetaRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, campaign_id: "" },
    });
    expect(record).toBeUndefined();
  });

  it("returns undefined for rows with no date_start", () => {
    const record = normalizeMetaRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, date_start: undefined },
    });
    expect(record).toBeUndefined();
  });

  it("returns null conversions when actions array is empty", () => {
    const record = normalizeMetaRecord({
      capturedAt: "2026-08-13T14:00:00.000Z",
      row: { ...SAMPLE_ROW, actions: [], cost_per_action_type: [] },
    });
    expect(record?.conversions).toBeNull();
    expect(record?.cpa).toBeNull();
  });

  it("builds a valid artifact with correct meta envelope", () => {
    const artifact = buildMetaArtifact({
      adAccountId: "act_759029483952879",
      capturedAt: "2026-08-13T14:00:00.000Z",
      errors: [],
      records: [normalizeMetaRecord({ capturedAt: "2026-08-13T14:00:00.000Z", row: SAMPLE_ROW })],
      status: "ok",
    });

    expect(artifact.meta.family).toBe("meta-ad-performance");
    expect(artifact.meta.provenance).toBe("live");
    expect(artifact.meta.version).toBe(1);
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.recordCount).toBe(1);
  });

  it("marks artifact as connector-needed when status is blocked", () => {
    const artifact = buildMetaArtifact({
      adAccountId: "act_unknown",
      capturedAt: "2026-08-13T14:00:00.000Z",
      errors: [{ message: "META_ACCESS_TOKEN is not configured." }],
      records: [],
      status: "blocked",
    });

    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
    expect(artifact.data.recordCount).toBe(0);
  });

  it("returns blocked status when META_ACCESS_TOKEN is missing", async () => {
    const result = await fetchMetaInsights({
      accessToken: "",
      adAccountId: "act_123",
    });
    expect(result.status).toBe("blocked");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns error status on non-200 HTTP response", async () => {
    const result = await fetchMetaInsights({
      accessToken: "fake-token",
      adAccountId: "act_123",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "Invalid token", code: 190 } }), {
          status: 400,
        }),
    });
    expect(result.status).toBe("error");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("paginates through multiple pages and collects all rows", async () => {
    let page = 0;
    const result = await fetchMetaInsights({
      accessToken: "fake-token",
      adAccountId: "act_123",
      fetchImpl: async (url) => {
        page += 1;
        if (page === 1) {
          return Response.json({
            data: [SAMPLE_ROW],
            paging: { next: "https://graph.facebook.com/v20.0/act_123/insights?after=cursor1" },
          });
        }
        return Response.json({ data: [{ ...SAMPLE_ROW, campaign_id: "99999" }], paging: {} });
      },
    });
    expect(result.status).toBe("ok");
    expect(result.rows).toHaveLength(2);
  });

  it("runMetaPerformance returns blocked artifact when credentials are missing", async () => {
    const artifact = await runMetaPerformance({
      accessToken: "",
      adAccountId: "",
      capturedAt: "2026-08-13T14:00:00.000Z",
    });
    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
  });

  it("runMetaPerformance returns live artifact with normalized records", async () => {
    const artifact = await runMetaPerformance({
      accessToken: "fake-token",
      adAccountId: "act_759029483952879",
      capturedAt: "2026-08-13T14:00:00.000Z",
      fetchImpl: async () => Response.json({ data: [SAMPLE_ROW], paging: {} }),
    });
    expect(artifact.meta.provenance).toBe("live");
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.records.length).toBe(1);
    expect(artifact.data.records[0].platform).toBe("Meta");
    expect(artifact.data.records[0].spendUsd).toBe(18.5);
  });
});
