import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildUnifiedArtifact,
  enrichWithGeo,
  matchGeoName,
  mergeAndDedup,
  runNormalize,
} from "./normalize.mjs";

const META_RECORD = {
  adSetId: "23851234567891",
  adSetName: "NRI_Dallas_Lookalike",
  campaignId: "23851234567890",
  campaignName: "XPAT_US_Dallas_Search_2026",
  capturedAt: "2026-08-13T14:00:00.000Z",
  clicks: 182,
  conversions: 4,
  cpa: 4.63,
  cpc: 0.1,
  cpm: 4.09,
  ctr: 4.02,
  date: "2026-08-13",
  geoId: null,
  geoName: null,
  impressions: 4523,
  objective: "OUTCOME_TRAFFIC",
  platform: "Meta",
  reach: 3800,
  spendUsd: 18.5,
  status: "ACTIVE",
};

const GOOGLE_RECORD = {
  adSetId: "98765432101",
  adSetName: "NRI_San_Jose_Lookalike",
  campaignId: "12345678901",
  campaignName: "XPAT_US_San_Jose_Search_2026",
  capturedAt: "2026-08-13T14:00:00.000Z",
  clicks: 95,
  conversions: 2,
  cpa: 9.25,
  cpc: 0.2,
  cpm: 8.1,
  ctr: 3.15,
  date: "2026-08-13",
  geoId: null,
  geoName: null,
  impressions: 3015,
  objective: "SEARCH",
  platform: "Google",
  reach: null,
  spendUsd: 18.5,
  status: "ACTIVE",
};

const SAMPLE_MARKETS = [
  {
    geoid: "31000US19100",
    name: "Dallas-Fort Worth-Arlington, TX",
    state: "TX",
  },
  {
    geoid: "31000US41940",
    name: "San Jose-Sunnyvale-Santa Clara, CA",
    state: "CA",
  },
];

describe("normalize pipeline", () => {
  it("matchGeoName finds Dallas from campaign name", () => {
    const index = new Map([
      ["dallas-fort worth-arlington, tx", { geoid: "31000US19100", name: "Dallas-Fort Worth-Arlington, TX" }],
      ["dallas", { geoid: "31000US19100", name: "Dallas-Fort Worth-Arlington, TX" }],
    ]);
    const match = matchGeoName("XPAT_US_Dallas_Search_2026", index);
    expect(match?.geoid).toBe("31000US19100");
  });

  it("matchGeoName returns null when no market matches campaign name", () => {
    const index = new Map([
      ["dallas", { geoid: "31000US19100", name: "Dallas-Fort Worth-Arlington, TX" }],
    ]);
    const match = matchGeoName("XPAT_US_National_Awareness_2026", index);
    expect(match).toBeNull();
  });

  it("matchGeoName returns null for empty campaign name", () => {
    const index = new Map([["dallas", { geoid: "31000US19100", name: "Dallas" }]]);
    expect(matchGeoName("", index)).toBeNull();
    expect(matchGeoName(null, index)).toBeNull();
  });

  it("mergeAndDedup combines Meta and Google records without duplicates", () => {
    const merged = mergeAndDedup([META_RECORD], [GOOGLE_RECORD]);
    expect(merged).toHaveLength(2);
    const platforms = merged.map((record) => record.platform);
    expect(platforms).toContain("Meta");
    expect(platforms).toContain("Google");
  });

  it("mergeAndDedup removes exact duplicates by platform+campaign+adset+date", () => {
    const duplicate = { ...META_RECORD };
    const merged = mergeAndDedup([META_RECORD, duplicate], []);
    expect(merged).toHaveLength(1);
  });

  it("mergeAndDedup sorts by date descending then spend descending", () => {
    const older = { ...META_RECORD, date: "2026-08-12", spendUsd: 10 };
    const newer = { ...META_RECORD, date: "2026-08-13", spendUsd: 18.5 };
    const merged = mergeAndDedup([older], [newer]);
    expect(merged[0].date).toBe("2026-08-13");
    expect(merged[1].date).toBe("2026-08-12");
  });

  it("enrichWithGeo matches Dallas campaign to market geoid", () => {
    const geoIndex = new Map([
      ["dallas", { geoid: "31000US19100", name: "Dallas-Fort Worth-Arlington, TX" }],
    ]);
    const enriched = enrichWithGeo([META_RECORD], geoIndex);
    expect(enriched[0].geoId).toBe("31000US19100");
    expect(enriched[0].geoName).toBe("Dallas-Fort Worth-Arlington, TX");
  });

  it("enrichWithGeo skips records that already have geoId", () => {
    const alreadyMatched = { ...META_RECORD, geoId: "31000US99999", geoName: "Custom" };
    const geoIndex = new Map([
      ["dallas", { geoid: "31000US19100", name: "Dallas-Fort Worth-Arlington, TX" }],
    ]);
    const enriched = enrichWithGeo([alreadyMatched], geoIndex);
    expect(enriched[0].geoId).toBe("31000US99999");
  });

  it("buildUnifiedArtifact sets status ok when both platforms succeed", () => {
    const artifact = buildUnifiedArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleErrors: [],
      googleStatus: "ok",
      metaErrors: [],
      metaStatus: "ok",
      records: [META_RECORD, GOOGLE_RECORD],
    });

    expect(artifact.meta.family).toBe("xpat-ad-performance");
    expect(artifact.meta.provenance).toBe("live");
    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.recordCount).toBe(2);
    expect(artifact.data.platforms).toContain("Meta");
    expect(artifact.data.platforms).toContain("Google");
  });

  it("buildUnifiedArtifact sets status partial when one platform fails", () => {
    const artifact = buildUnifiedArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleErrors: [{ message: "API error" }],
      googleStatus: "error",
      metaErrors: [],
      metaStatus: "ok",
      records: [META_RECORD],
    });
    expect(artifact.data.status).toBe("partial");
    expect(artifact.data.errors).toHaveLength(1);
    expect(artifact.data.errors[0].platform).toBe("Google");
  });

  it("buildUnifiedArtifact sets connector-needed when both platforms blocked", () => {
    const artifact = buildUnifiedArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleErrors: [{ message: "Missing credentials" }],
      googleStatus: "blocked",
      metaErrors: [{ message: "Missing credentials" }],
      metaStatus: "blocked",
      records: [],
    });
    expect(artifact.meta.provenance).toBe("connector-needed");
    expect(artifact.data.status).toBe("blocked");
    expect(artifact.data.recordCount).toBe(0);
  });

  it("buildUnifiedArtifact computes dateRange from records", () => {
    const record1 = { ...META_RECORD, date: "2026-08-10" };
    const record2 = { ...GOOGLE_RECORD, date: "2026-08-13" };
    const artifact = buildUnifiedArtifact({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleErrors: [],
      googleStatus: "ok",
      metaErrors: [],
      metaStatus: "ok",
      records: [record1, record2],
    });
    expect(artifact.data.dateRange).toEqual({ from: "2026-08-10", to: "2026-08-13" });
  });

  it("runNormalize writes artifact to disk and returns it", async () => {
    const root = mkdtempSync(join(tmpdir(), "xpat-normalize-"));
    mkdirSync(join(root, "data", "artifacts"), { recursive: true });
    mkdirSync(join(root, "pipeline", "lib"), { recursive: true });

    const metaArtifact = {
      data: { errors: [], records: [META_RECORD], status: "ok" },
    };
    const googleArtifact = {
      data: { errors: [], records: [GOOGLE_RECORD], status: "ok" },
    };

    const artifact = await runNormalize({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleArtifact,
      metaArtifact,
      root,
    });

    expect(artifact.data.status).toBe("ok");
    expect(artifact.data.recordCount).toBe(2);

    const written = JSON.parse(
      readFileSync(join(root, "data", "artifacts", "xpat-ad-performance.json"), "utf8"),
    );
    expect(written.meta.family).toBe("xpat-ad-performance");
    expect(written.data.recordCount).toBe(2);
  });

  it("runNormalize matches geoids from markets.json when present", async () => {
    const root = mkdtempSync(join(tmpdir(), "xpat-normalize-geo-"));
    mkdirSync(join(root, "data", "artifacts"), { recursive: true });

    writeFileSync(
      join(root, "data", "artifacts", "markets.json"),
      JSON.stringify({ data: { markets: SAMPLE_MARKETS } }),
    );

    const metaArtifact = {
      data: { errors: [], records: [META_RECORD], status: "ok" },
    };
    const googleArtifact = {
      data: { errors: [], records: [GOOGLE_RECORD], status: "ok" },
    };

    const artifact = await runNormalize({
      capturedAt: "2026-08-13T14:00:00.000Z",
      googleArtifact,
      metaArtifact,
      root,
    });

    const dallasRecord = artifact.data.records.find(
      (record) => record.campaignName === "XPAT_US_Dallas_Search_2026",
    );
    expect(dallasRecord?.geoId).toBe("31000US19100");

    const sjRecord = artifact.data.records.find(
      (record) => record.campaignName === "XPAT_US_San_Jose_Search_2026",
    );
    expect(sjRecord?.geoId).toBe("31000US41940");
  });
});
