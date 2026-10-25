import { describe, expect, it } from "vitest";

import {
  comparePlatforms,
  getMarketPerformance,
  getTopCampaigns,
  summarizePerformance,
} from "./ad-performance-tools";

const META_RECORDS = [
  {
    adSetId: "111",
    adSetName: "NRI_Dallas_Lookalike",
    campaignId: "campaign-1",
    campaignName: "iOS_APP_Signups_Dallas_2026",
    capturedAt: "2026-08-13T00:00:00.000Z",
    clicks: 182,
    conversions: 4,
    cpa: 4.63,
    cpc: 0.1,
    cpm: 4.09,
    ctr: 4.02,
    date: "2026-04-01",
    geoId: "31000US19100",
    geoName: "Dallas-Fort Worth-Arlington, TX",
    impressions: 4523,
    objective: "APP_INSTALLS",
    platform: "Meta" as const,
    reach: 3800,
    spendUsd: 18.5,
    status: "ACTIVE",
  },
  {
    adSetId: "222",
    adSetName: "NRI_SanJose_Lookalike",
    campaignId: "campaign-2",
    campaignName: "Android_APP_Install_SanJose_2026",
    capturedAt: "2026-08-13T00:00:00.000Z",
    clicks: 95,
    conversions: 2,
    cpa: 9.25,
    cpc: 0.2,
    cpm: 8.1,
    ctr: 3.15,
    date: "2026-04-01",
    geoId: "31000US41940",
    geoName: "San Jose-Sunnyvale-Santa Clara, CA",
    impressions: 3015,
    objective: "APP_INSTALLS",
    platform: "Meta" as const,
    reach: null,
    spendUsd: 18.5,
    status: "ACTIVE",
  },
  {
    adSetId: "333",
    adSetName: "NRI_National",
    campaignId: "campaign-3",
    campaignName: "Web_Signup_AuthPage_2026",
    capturedAt: "2026-08-13T00:00:00.000Z",
    clicks: 500,
    conversions: null,
    cpa: null,
    cpc: 0.05,
    cpm: 3.0,
    ctr: 5.0,
    date: "2026-04-01",
    geoId: null,
    geoName: null,
    impressions: 10000,
    objective: "OUTCOME_TRAFFIC",
    platform: "Meta" as const,
    reach: 8000,
    spendUsd: 25.0,
    status: "ACTIVE",
  },
];

const GOOGLE_RECORDS = [
  {
    adSetId: "444",
    adSetName: "Search_NRI_Keywords",
    campaignId: "campaign-4",
    campaignName: "Google_Search_NRI_2026",
    capturedAt: "2026-08-13T00:00:00.000Z",
    clicks: 120,
    conversions: 3,
    cpa: 5.0,
    cpc: 0.5,
    cpm: 10.0,
    ctr: 2.5,
    date: "2026-04-01",
    geoId: null,
    geoName: null,
    impressions: 4800,
    objective: "SEARCH",
    platform: "Google" as const,
    reach: null,
    spendUsd: 60.0,
    status: "ACTIVE",
  },
];

const ALL_RECORDS = [...META_RECORDS, ...GOOGLE_RECORDS];

describe("ad-performance-tools", () => {
  describe("summarizePerformance", () => {
    it("returns zero summary for empty records", () => {
      const result = summarizePerformance([]);
      expect(result.totalSpendUsd).toBe(0);
      expect(result.totalImpressions).toBe(0);
      expect(result.recordCount).toBe(0);
      expect(result.avgCtr).toBeNull();
    });

    it("calculates total spend correctly", () => {
      const result = summarizePerformance(META_RECORDS);
      expect(result.totalSpendUsd).toBe(62);
      expect(result.totalImpressions).toBe(17538);
      expect(result.totalClicks).toBe(777);
    });

    it("calculates average CTR correctly", () => {
      const result = summarizePerformance(META_RECORDS);
      expect(result.avgCtr).toBeCloseTo((777 / 17538) * 100, 1);
    });

    it("calculates average CPC correctly", () => {
      const result = summarizePerformance(META_RECORDS);
      expect(result.avgCpc).toBeCloseTo(62 / 777, 2);
    });

    it("includes source envelope", () => {
      const result = summarizePerformance(META_RECORDS);
      expect(result.source.family).toBe("xpat-ad-performance");
    });

    it("lists unique platforms in results", () => {
      const result = summarizePerformance(ALL_RECORDS);
      expect(result.platforms).toContain("Meta");
      expect(result.platforms).toContain("Google");
    });
  });

  describe("getTopCampaigns", () => {
    it("returns campaigns sorted by spend descending", () => {
      const result = getTopCampaigns(META_RECORDS, "spend", 5);
      expect(result.campaigns[0].campaignName).toBe("Web_Signup_AuthPage_2026");
      expect(result.campaigns[0].totalSpendUsd).toBe(25.0);
    });

    it("returns campaigns sorted by clicks descending", () => {
      const result = getTopCampaigns(META_RECORDS, "clicks", 5);
      expect(result.campaigns[0].totalClicks).toBe(500);
    });

    it("respects the limit parameter", () => {
      const result = getTopCampaigns(META_RECORDS, "spend", 2);
      expect(result.campaigns).toHaveLength(2);
    });

    it("aggregates multiple records for same campaign", () => {
      const duplicateRecords = [
        ...META_RECORDS,
        { ...META_RECORDS[0], date: "2026-04-02", spendUsd: 10, clicks: 50 },
      ];
      const result = getTopCampaigns(duplicateRecords, "spend", 5);
      const campaign1 = result.campaigns.find((c) => c.campaignId === "campaign-1");
      expect(campaign1?.totalSpendUsd).toBe(28.5);
      expect(campaign1?.totalClicks).toBe(232);
    });

    it("includes source envelope", () => {
      const result = getTopCampaigns(META_RECORDS, "spend", 5);
      expect(result.source.family).toBe("xpat-ad-performance");
    });
  });

  describe("getMarketPerformance", () => {
    it("finds Dallas by geo name", () => {
      const result = getMarketPerformance(META_RECORDS, "Dallas");
      expect(result.found).toBe(true);
      expect(result.totalSpendUsd).toBe(18.5);
      expect(result.matchedGeoId).toBe("31000US19100");
    });

    it("finds San Jose by geo name", () => {
      const result = getMarketPerformance(META_RECORDS, "San Jose");
      expect(result.found).toBe(true);
      expect(result.totalSpendUsd).toBe(18.5);
    });

    it("finds campaign by name keyword", () => {
      const result = getMarketPerformance(META_RECORDS, "Dallas");
      expect(result.found).toBe(true);
      expect(result.campaigns).toContain("iOS_APP_Signups_Dallas_2026");
    });

    it("returns found:false for unknown market", () => {
      const result = getMarketPerformance(META_RECORDS, "Denver");
      expect(result.found).toBe(false);
      expect(result.totalSpendUsd).toBe(0);
    });

    it("normalizes underscores in market name matching", () => {
      const result = getMarketPerformance(META_RECORDS, "san jose");
      expect(result.found).toBe(true);
    });

    it("includes source envelope", () => {
      const result = getMarketPerformance(META_RECORDS, "Dallas");
      expect(result.source.family).toBe("xpat-ad-performance");
    });
  });

  describe("comparePlatforms", () => {
    it("returns separate rows for Meta and Google", () => {
      const result = comparePlatforms(ALL_RECORDS);
      expect(result.availablePlatforms).toContain("Meta");
      expect(result.availablePlatforms).toContain("Google");
      expect(result.platforms).toHaveLength(2);
    });

    it("correctly totals spend per platform", () => {
      const result = comparePlatforms(ALL_RECORDS);
      const meta = result.platforms.find((p) => p.platform === "Meta");
      const google = result.platforms.find((p) => p.platform === "Google");
      expect(meta?.totalSpendUsd).toBe(62);
      expect(google?.totalSpendUsd).toBe(60);
    });

    it("counts unique campaigns per platform", () => {
      const result = comparePlatforms(ALL_RECORDS);
      const meta = result.platforms.find((p) => p.platform === "Meta");
      expect(meta?.campaignCount).toBe(3);
    });

    it("returns single platform when only one exists", () => {
      const result = comparePlatforms(META_RECORDS);
      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0].platform).toBe("Meta");
    });

    it("includes source envelope", () => {
      const result = comparePlatforms(ALL_RECORDS);
      expect(result.source.family).toBe("xpat-ad-performance");
    });
  });
});
