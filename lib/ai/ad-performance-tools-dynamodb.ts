/**
 * DynamoDB-based ad performance tools for the "Ask the ad analyst" agent.
 *
 * Reads from xpat-ads-intelligence DynamoDB table (pre-joined data).
 * This is the production version — for local development, use ad-performance-tools.ts
 * which reads from local JSON artifacts.
 *
 * Table: xpat-ads-intelligence-{env}
 * GSIs: GSI-ByDate, GSI-ByKeyword
 */

import { tool } from "ai";
import { z } from "zod";
import { createHash } from "crypto";
import {
  queryByPK,
  queryByDate,
  queryByKeyword,
  getCampaignSummariesForDate,
  scanAllCampaigns,
  getTableName,
} from "./dynamodb-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceEnvelope {
  family: string;
  label: string;
  asOf: string;
  provenance: string;
}

function makeSource(label: string): SourceEnvelope {
  return {
    family: "google-ads-intelligence",
    label,
    asOf: new Date().toISOString(),
    provenance: `DynamoDB:${getTableName()}`,
  };
}

// ---------------------------------------------------------------------------
// Tool: Get Campaign Summary
// ---------------------------------------------------------------------------

const getCampaignSummary = tool({
  description: `Get summary metrics for all Google Ads campaigns on a specific date.
Returns: campaign name, status, channel type, spend, clicks, impressions, conversions, CTR, CPC.
Use this to answer questions about overall campaign performance.`,
  inputSchema: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format. Defaults to most recent.").optional(),
  }),
  execute: async ({ date }) => {
    try {
      // If no date provided, use today or scan for latest
      const queryDate = date ?? new Date().toISOString().slice(0, 10);
      
      const summaries = await getCampaignSummariesForDate(queryDate, { limit: 50 });
      
      if (summaries.length === 0) {
        // Try scanning for any recent data
        const recent = await scanAllCampaigns(20);
        if (recent.length === 0) {
          return {
            source: makeSource("getCampaignSummary"),
            campaigns: [],
            message: "No campaign data found in DynamoDB",
          };
        }
        
        // Extract unique dates and use the most recent
        const dates = [...new Set(recent.map(r => String(r.date)))].sort().reverse();
        const latestDate = dates[0];
        const latestSummaries = await getCampaignSummariesForDate(latestDate, { limit: 50 });
        
        return {
          source: makeSource("getCampaignSummary"),
          date: latestDate,
          campaigns: latestSummaries.map(s => ({
            campaignId: s.campaignId,
            campaignName: s.campaignName,
            campaignStatus: s.campaignStatus,
            channelType: s.channelType,
            impressions: s.impressions,
            clicks: s.clicks,
            spendUsd: s.spendUsd,
            conversions: s.conversions,
            ctrPct: s.ctrPct,
            avgCpcUsd: s.avgCpcUsd,
            costPerConversionUsd: s.costPerConversionUsd,
            adGroupCount: s.adGroupCount,
          })),
          totalCampaigns: latestSummaries.length,
        };
      }

      return {
        source: makeSource("getCampaignSummary"),
        date: queryDate,
        campaigns: summaries.map(s => ({
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          campaignStatus: s.campaignStatus,
          channelType: s.channelType,
          impressions: s.impressions,
          clicks: s.clicks,
          spendUsd: s.spendUsd,
          conversions: s.conversions,
          ctrPct: s.ctrPct,
          avgCpcUsd: s.avgCpcUsd,
          costPerConversionUsd: s.costPerConversionUsd,
          adGroupCount: s.adGroupCount,
        })),
        totalCampaigns: summaries.length,
      };
    } catch (error) {
      return {
        source: makeSource("getCampaignSummary"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Get Keywords by Campaign
// ---------------------------------------------------------------------------

const getKeywordsByCampaign = tool({
  description: `Get all keywords for a specific campaign on a specific date.
Returns: keyword text, match type, quality score, impressions, clicks, spend, conversions, CTR.
Includes nested search terms for each keyword.`,
  inputSchema: z.object({
    campaignId: z.string().describe("The campaign ID (numeric string)"),
    date: z.string().describe("Date in YYYY-MM-DD format").optional(),
  }),
  execute: async ({ campaignId, date }) => {
    try {
      const queryDate = date ?? new Date().toISOString().slice(0, 10);
      const skPrefix = `DATE#${queryDate}#ADGROUP#`;
      
      const items = await queryByPK(`CAMPAIGN#${campaignId}`, skPrefix, { limit: 100 });
      
      // Filter out summary records
      const keywords = items.filter(item => !String(item.SK ?? "").includes("#SUMMARY"));

      return {
        source: makeSource("getKeywordsByCampaign"),
        campaignId,
        date: queryDate,
        keywords: keywords.map(k => ({
          keyword: k.keyword,
          matchType: k.matchType,
          qualityScore: k.qualityScore,
          adGroupName: k.adGroupName,
          impressions: k.impressions,
          clicks: k.clicks,
          spendUsd: k.spendUsd,
          conversions: k.conversions,
          ctrPct: k.ctrPct,
          avgCpcUsd: k.avgCpcUsd,
          costPerConversionUsd: k.costPerConversionUsd,
          isWastedSpend: k.isWastedSpend,
          isHighCpc: k.isHighCpc,
          isLowQuality: k.isLowQuality,
          searchTerms: k.searchTerms,
        })),
        totalKeywords: keywords.length,
      };
    } catch (error) {
      return {
        source: makeSource("getKeywordsByCampaign"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Search by Keyword
// ---------------------------------------------------------------------------

const searchByKeyword = tool({
  description: `Search for a specific keyword across all campaigns.
Uses GSI-ByKeyword for efficient lookup.
Returns: all campaigns and dates where this keyword appears, with metrics.`,
  inputSchema: z.object({
    keyword: z.string().describe("The keyword to search for (e.g., 'money transfer to india')"),
    limit: z.number().describe("Max results to return").optional(),
  }),
  execute: async ({ keyword, limit }) => {
    try {
      const items = await queryByKeyword(keyword, { limit: limit ?? 20 });

      return {
        source: makeSource("searchByKeyword"),
        searchedKeyword: keyword,
        results: items.map(item => ({
          campaignId: item.campaignId,
          campaignName: item.campaignName,
          adGroupName: item.adGroupName,
          keyword: item.keyword,
          matchType: item.matchType,
          date: item.date,
          impressions: item.impressions,
          clicks: item.clicks,
          spendUsd: item.spendUsd,
          conversions: item.conversions,
          ctrPct: item.ctrPct,
          avgCpcUsd: item.avgCpcUsd,
          qualityScore: item.qualityScore,
          isWastedSpend: item.isWastedSpend,
        })),
        totalResults: items.length,
      };
    } catch (error) {
      return {
        source: makeSource("searchByKeyword"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Get Daily Performance
// ---------------------------------------------------------------------------

const getDailyPerformance = tool({
  description: `Get all performance data for a specific date across all campaigns.
Returns: all keyword-level records with full hierarchy (campaign → adgroup → keyword → search terms).
Use this to analyze a single day's performance in detail.`,
  inputSchema: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    limit: z.number().describe("Max results to return").optional(),
  }),
  execute: async ({ date, limit }) => {
    try {
      const items = await queryByDate(date, undefined, { limit: limit ?? 100 });

      // Separate summaries and keyword records
      const summaries = items.filter(item => String(item.SK ?? "").includes("#SUMMARY"));
      const keywords = items.filter(item => !String(item.SK ?? "").includes("#SUMMARY"));

      // Calculate totals
      const totalSpend = summaries.reduce((sum, s) => sum + (Number(s.spendUsd) || 0), 0);
      const totalClicks = summaries.reduce((sum, s) => sum + (Number(s.clicks) || 0), 0);
      const totalImpressions = summaries.reduce((sum, s) => sum + (Number(s.impressions) || 0), 0);
      const totalConversions = summaries.reduce((sum, s) => sum + (Number(s.conversions) || 0), 0);

      return {
        source: makeSource("getDailyPerformance"),
        date,
        totals: {
          spendUsd: Math.round(totalSpend * 100) / 100,
          clicks: totalClicks,
          impressions: totalImpressions,
          conversions: totalConversions,
          ctrPct: totalImpressions > 0 ? Math.round(totalClicks / totalImpressions * 10000) / 100 : null,
          avgCpcUsd: totalClicks > 0 ? Math.round(totalSpend / totalClicks * 100) / 100 : null,
        },
        campaignCount: summaries.length,
        keywordCount: keywords.length,
        campaigns: summaries.map(s => ({
          campaignId: s.campaignId,
          campaignName: s.campaignName,
          spendUsd: s.spendUsd,
          clicks: s.clicks,
          conversions: s.conversions,
        })),
      };
    } catch (error) {
      return {
        source: makeSource("getDailyPerformance"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Get Keyword Full Context
// ---------------------------------------------------------------------------

const getKeywordFullContext = tool({
  description: `Get the complete context for a specific keyword on a specific date.
Returns: full hierarchy with campaign details, ad group, keyword metrics, search terms, device breakdown, and geo summary.
This is a pre-joined record — one query returns everything.`,
  inputSchema: z.object({
    campaignId: z.string().describe("The campaign ID"),
    adGroupId: z.string().describe("The ad group ID"),
    keyword: z.string().describe("The keyword text"),
    date: z.string().describe("Date in YYYY-MM-DD format"),
  }),
  execute: async ({ campaignId, adGroupId, keyword, date }) => {
    try {
      // Build the SK pattern to find the keyword
      const keywordHash = createHash("md5")
        .update(keyword.toLowerCase().trim())
        .digest("hex")
        .slice(0, 8);

      const sk = `DATE#${date}#ADGROUP#${adGroupId}#KW#${keywordHash}`;
      const items = await queryByPK(`CAMPAIGN#${campaignId}`, sk, { limit: 1 });

      if (items.length === 0) {
        return {
          source: makeSource("getKeywordFullContext"),
          found: false,
          message: "Keyword not found for the specified campaign, ad group, and date",
        };
      }

      const item = items[0];
      
      return {
        source: makeSource("getKeywordFullContext"),
        found: true,
        context: {
          // Campaign level
          campaign: {
            id: item.campaignId,
            name: item.campaignName,
            status: item.campaignStatus,
            channelType: item.channelType,
            biddingStrategy: item.biddingStrategy,
          },
          // Ad Group level
          adGroup: {
            id: item.adGroupId,
            name: item.adGroupName,
            status: item.adGroupStatus,
            type: item.adGroupType,
          },
          // Keyword level
          keyword: {
            text: item.keyword,
            matchType: item.matchType,
            status: item.keywordStatus,
            qualityScore: item.qualityScore,
          },
          // Metrics
          metrics: {
            date: item.date,
            impressions: item.impressions,
            clicks: item.clicks,
            spendUsd: item.spendUsd,
            conversions: item.conversions,
            ctrPct: item.ctrPct,
            avgCpcUsd: item.avgCpcUsd,
            costPerConversionUsd: item.costPerConversionUsd,
          },
          // Flags
          flags: {
            isWastedSpend: item.isWastedSpend,
            isHighCpc: item.isHighCpc,
            isLowQuality: item.isLowQuality,
          },
          // Nested data
          searchTerms: item.searchTerms,
          ads: item.ads,
          deviceBreakdown: item.deviceBreakdown,
          geoSummary: item.geoSummary,
          // Campaign-level totals for context
          campaignTotals: {
            impressions: item.campaignImpressions,
            clicks: item.campaignClicks,
            spendUsd: item.campaignSpendUsd,
            conversions: item.campaignConversions,
          },
        },
      };
    } catch (error) {
      return {
        source: makeSource("getKeywordFullContext"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Get Wasted Spend Keywords
// ---------------------------------------------------------------------------

const getWastedSpendKeywords = tool({
  description: `Find keywords with wasted spend (spend > $5 but 0 conversions).
Returns keywords sorted by spend descending, flagged as isWastedSpend.
Use this to identify optimization opportunities.`,
  inputSchema: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    minSpend: z.number().describe("Minimum spend threshold in USD").optional(),
  }),
  execute: async ({ date, minSpend }) => {
    try {
      const items = await queryByDate(date, undefined, { limit: 200 });
      
      // Filter to keyword records (not summaries) with wasted spend
      const threshold = minSpend ?? 5;
      const wasted = items
        .filter(item => !String(item.SK ?? "").includes("#SUMMARY"))
        .filter(item => item.isWastedSpend || (Number(item.spendUsd) > threshold && Number(item.conversions) === 0))
        .sort((a, b) => (Number(b.spendUsd) || 0) - (Number(a.spendUsd) || 0));

      const totalWastedSpend = wasted.reduce((sum, k) => sum + (Number(k.spendUsd) || 0), 0);

      return {
        source: makeSource("getWastedSpendKeywords"),
        date,
        minSpendThreshold: threshold,
        keywords: wasted.map(k => ({
          keyword: k.keyword,
          matchType: k.matchType,
          campaignName: k.campaignName,
          adGroupName: k.adGroupName,
          spendUsd: k.spendUsd,
          clicks: k.clicks,
          impressions: k.impressions,
          conversions: k.conversions,
          avgCpcUsd: k.avgCpcUsd,
          qualityScore: k.qualityScore,
        })),
        totalWastedKeywords: wasted.length,
        totalWastedSpendUsd: Math.round(totalWastedSpend * 100) / 100,
      };
    } catch (error) {
      return {
        source: makeSource("getWastedSpendKeywords"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Tool: Get Search Terms for Keyword
// ---------------------------------------------------------------------------

const getSearchTermsForKeyword = tool({
  description: `Get the actual search queries that triggered a specific keyword.
Search terms are pre-joined into the keyword record.
Returns: search term, impressions, clicks, spend, conversions.`,
  inputSchema: z.object({
    keyword: z.string().describe("The keyword to get search terms for"),
    limit: z.number().describe("Max keyword records to search").optional(),
  }),
  execute: async ({ keyword, limit }) => {
    try {
      const items = await queryByKeyword(keyword, { limit: limit ?? 10 });
      
      // Aggregate search terms across all records for this keyword
      const allSearchTerms: Record<string, {
        term: string;
        impressions: number;
        clicks: number;
        spendUsd: number;
        conversions: number;
      }> = {};

      for (const item of items) {
        const terms = item.searchTerms as Array<{
          term: string;
          impressions?: number;
          clicks?: number;
          spendUsd?: number;
          conversions?: number;
        }> ?? [];
        
        for (const t of terms) {
          if (!allSearchTerms[t.term]) {
            allSearchTerms[t.term] = {
              term: t.term,
              impressions: 0,
              clicks: 0,
              spendUsd: 0,
              conversions: 0,
            };
          }
          allSearchTerms[t.term].impressions += t.impressions ?? 0;
          allSearchTerms[t.term].clicks += t.clicks ?? 0;
          allSearchTerms[t.term].spendUsd += t.spendUsd ?? 0;
          allSearchTerms[t.term].conversions += t.conversions ?? 0;
        }
      }

      const sortedTerms = Object.values(allSearchTerms)
        .sort((a, b) => b.spendUsd - a.spendUsd);

      return {
        source: makeSource("getSearchTermsForKeyword"),
        keyword,
        searchTerms: sortedTerms.map(t => ({
          ...t,
          spendUsd: Math.round(t.spendUsd * 100) / 100,
          ctrPct: t.impressions > 0 ? Math.round(t.clicks / t.impressions * 10000) / 100 : null,
        })),
        totalSearchTerms: sortedTerms.length,
        recordsSearched: items.length,
      };
    } catch (error) {
      return {
        source: makeSource("getSearchTermsForKeyword"),
        error: `Failed to query DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// Export all DynamoDB tools
// ---------------------------------------------------------------------------

export const dynamoDBAdPerformanceTools = {
  getCampaignSummary,
  getKeywordsByCampaign,
  searchByKeyword,
  getDailyPerformance,
  getKeywordFullContext,
  getWastedSpendKeywords,
  getSearchTermsForKeyword,
};
