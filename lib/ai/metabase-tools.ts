/**
 * Read-only Metabase attribution tools for the "Ask the ad analyst" agent.
 *
 * Three tools that query XPAT's prod read database via Metabase to surface
 * real attribution data — actual signups, KYC completions, and transfers
 * per campaign — which the Meta/Google Ads APIs cannot provide.
 *
 * Tables used (DB2 — prod read database, MySQL 8.0):
 *   v_acquisition_data_clean  — utm_campaign, utm_source, utm_medium, user_id, acquisition_timestamp
 *   v_userprofile_clean       — user_id, create_time, is_signup_workflow_completed, account_status
 *   v_userkycdetails_clean    — user_id + KYC status fields
 *   transaction               — user_id, transaction-level data
 *
 * All queries are SELECT-only. No writes.
 */

import { tool } from "ai";
import { z } from "zod";

import { hasMetabaseCredentials, runMetabaseQuery } from "@/lib/ai/metabase-client";

// ---------------------------------------------------------------------------
// Connector-needed guard
// ---------------------------------------------------------------------------

const CONNECTOR_NEEDED = {
  found: false,
  connectorNeeded: true,
  message: "Signup and transfer attribution data is not available in this environment.",
} as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tool: getGoogleAdsInsights
// Reads the google-ads-insights.json artifact — contains competitor presence,
// search term quality signals, landing page performance, device breakdown,
// and top ad copy from manually downloaded Google Ads reports.
// Use this when diagnosing CTR problems or understanding competitor context.
// ---------------------------------------------------------------------------

const GOOGLE_ADS_INSIGHTS_ARTIFACT = join(
  process.cwd(),
  "data",
  "artifacts",
  "google-ads-insights.json",
);

function loadGoogleAdsInsights() {
  if (!existsSync(GOOGLE_ADS_INSIGHTS_ARTIFACT)) return null;
  try {
    return JSON.parse(readFileSync(GOOGLE_ADS_INSIGHTS_ARTIFACT, "utf8"));
  } catch {
    return null;
  }
}

export const getGoogleAdsInsightsTool = tool({
  description:
    "Get Google Ads diagnostic insights: competitor auction presence (Remitly/Wise/Xoom impression share vs XPAT), search term quality (which queries had low vs high CTR), landing page performance, device breakdown, and top performing ad headlines. Use this when diagnosing why a campaign had low CTR, or to understand competitor pressure in the auction.",
  inputSchema: z.object({
    section: z
      .enum(["all", "competitors", "searchTerms", "landingPages", "devices", "ads"])
      .optional()
      .describe("Which section to return. Defaults to all."),
    searchTermFilter: z
      .enum(["all", "lowCtr", "highCtr"])
      .optional()
      .describe("For searchTerms section: filter to low-CTR (wasted spend) or high-CTR (strong intent) terms only."),
  }),
  execute: async ({ section = "all", searchTermFilter = "all" }) => {
    const artifact = loadGoogleAdsInsights();

    if (!artifact) {
      return {
        found: false,
        message: "Google Ads insights not available. Run pipeline/xpat-ads/ingest-google-reports.mjs to generate.",
      };
    }

    const data = artifact.data;
    const result: Record<string, unknown> = {
      found: true,
      reportDateRange: data.auctionInsights?.dateRange ?? data.searchTerms?.dateRange ?? "unknown",
      generatedAt: artifact.meta.generatedAt,
    };

    if (section === "all" || section === "competitors") {
      result.competitorPresence = data.auctionInsights ? {
        xpatImpressionShare: data.auctionInsights.xpatImpressionShareLabel,
        xpatTopOfPageRate: data.auctionInsights.xpatTopOfPageRate,
        competitors: data.auctionInsights.competitors,
        note: data.auctionInsights.note ?? "Remitly dominates with 44.83% impression share and appears in 60.75% of XPAT's auctions — a structural headwind on CTR.",
      } : null;
    }

    if (section === "all" || section === "searchTerms") {
      const st = data.searchTerms;
      if (st) {
        result.searchTerms = {
          overallCtr: st.overallCtr,
          totalTerms: st.totalUniqueTerms,
          lowCtrTermCount: st.lowCtrTermCount,
          highCtrTermCount: st.highCtrTermCount,
          ...(searchTermFilter !== "highCtr" ? { lowCtrTerms: st.lowCtrTerms?.slice(0, 10) } : {}),
          ...(searchTermFilter !== "lowCtr" ? { highCtrTerms: st.highCtrTerms?.slice(0, 10) } : {}),
        };
      }
    }

    if (section === "all" || section === "landingPages") {
      result.landingPages = data.landingPages?.topLandingPages?.slice(0, 8) ?? null;
    }

    if (section === "all" || section === "devices") {
      result.devices = data.devices?.devices ?? null;
    }

    if (section === "all" || section === "ads") {
      result.topAds = data.ads?.topAdsByConversions?.slice(0, 8) ?? null;
    }

    return result;
  },
});

// ---------------------------------------------------------------------------
// Tool: getCampaignList
// Reads the pre-fetched utm-campaigns artifact from disk.
// Agent uses this FIRST to find the exact utm_campaign value before
// calling getSignupFunnel or getCampaignAttribution.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const UTM_CAMPAIGNS_ARTIFACT = join(
  process.cwd(),
  "data",
  "artifacts",
  "utm-campaigns.json",
);

const CAMPAIGN_FUNNEL_ARTIFACT = join(
  process.cwd(),
  "data",
  "artifacts",
  "campaign-funnel.json",
);

function loadCampaignFunnelArtifact() {
  if (!existsSync(CAMPAIGN_FUNNEL_ARTIFACT)) return null;
  try {
    return JSON.parse(readFileSync(CAMPAIGN_FUNNEL_ARTIFACT, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool: getActiveCampaignFunnel
// Same as getCampaignFunnel but filtered to currently active campaigns only.
// Use this by DEFAULT for all campaign questions.
// Active campaign IDs refreshed Sep 15, 2026 from Google Ads live data.
// ---------------------------------------------------------------------------

// Active campaign IDs — loaded from data/artifacts/active-campaigns.json
// Refresh by running: node scripts/get-active-campaigns.mjs
// Future: replace with scheduled cron job
const ACTIVE_CAMPAIGNS_ARTIFACT = join(
  process.cwd(),
  "data",
  "artifacts",
  "active-campaigns.json",
);

function loadActiveCampaignIds(): Set<string> {
  try {
    if (!existsSync(ACTIVE_CAMPAIGNS_ARTIFACT)) return new Set();
    const artifact = JSON.parse(readFileSync(ACTIVE_CAMPAIGNS_ARTIFACT, "utf8"));
    const ids: string[] = artifact?.data?.enabledCampaignIds ?? [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export const getActiveCampaignFunnelTool = tool({
  description:
    "Get funnel data for CURRENTLY ACTIVE campaigns only (enabled in Google Ads right now, plus paused within 15 days). USE THIS BY DEFAULT for all campaign questions unless the user explicitly asks for all campaigns or historical data. Returns signups, phone verification, US/Indian bank linking, first transfer, spend, CTR, exchange rate context.",
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe("Filter by campaign name keyword. Omit to return all active campaigns."),
    sortBy: z
      .enum(["signups", "transfers", "transferRate", "spend", "costPerTransfer"])
      .optional()
      .describe("Sort by metric. Defaults to signups."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(85)
      .optional()
      .describe("Max campaigns to return. Defaults to 20."),
  }),
  execute: async ({ keyword, sortBy = "signups", limit = 20 }) => {
    const artifact = loadCampaignFunnelArtifact();
    if (!artifact) {
      return { found: false, message: "Campaign funnel data not available. Run pipeline/xpat-ads/build-campaign-funnel.mjs." };
    }

    // Build a set of active campaign IDs from active-campaigns.json.
    // Only match on adCampaignId — name-based matching is too broad and
    // causes unrelated campaigns (cr_profile, etc.) to pass the filter.
    const activeCampaignIds = loadActiveCampaignIds();

    let campaigns = (artifact.data.campaigns as Array<Record<string, unknown>>).filter((c) => {
      const id = String(c.adCampaignId ?? "");
      return activeCampaignIds.has(id);
    });

    if (keyword) {
      const lower = keyword.toLowerCase();
      campaigns = campaigns.filter((c) =>
        String(c.utmCampaignNormalized ?? "").includes(lower) ||
        (c.adCampaignName && String(c.adCampaignName).toLowerCase().includes(lower))
      );
    }

    campaigns = [...campaigns].sort((a, b) => {
      if (sortBy === "transfers") return Number(b.completedFirstTransfer) - Number(a.completedFirstTransfer);
      if (sortBy === "transferRate") return Number(b.transferRate ?? 0) - Number(a.transferRate ?? 0);
      if (sortBy === "spend") return Number(b.spendUsd ?? 0) - Number(a.spendUsd ?? 0);
      if (sortBy === "costPerTransfer") return (Number(a.costPerTransfer ?? Infinity)) - (Number(b.costPerTransfer ?? Infinity));
      return Number(b.signups) - Number(a.signups);
    });

    return {
      found: campaigns.length > 0,
      activeOnly: true,
      note: "Active campaigns only. For all historical campaigns, use getCampaignFunnel.",
      generatedAt: artifact.meta.generatedAt,
      dateRange: "Sep 2025 – Sep 2026",
      activeCampaignCount: campaigns.length,
      activeCampaignIdsSource: "data/artifacts/active-campaigns.json — refresh by running scripts/get-active-campaigns.mjs",
      benchmarks: artifact.data.benchmarks,
      campaigns: campaigns.slice(0, limit),
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: getCampaignFunnel
// Reads the pre-built campaign-funnel.json artifact — full funnel from
// ad click → signup → phone → US bank → Indian bank → first transfer.
// Also includes ad spend, CTR, CPC where available from ad performance data.
// Use this as the PRIMARY tool for any funnel or attribution question.
// ---------------------------------------------------------------------------

export const getCampaignFunnelTool = tool({
  description:
    "Get the complete funnel for XPAT campaigns: signups, phone verification, US bank added, Indian bank added, and first transfer completion — all per campaign. Also includes ad spend, CTR, CPC where available. Use this FIRST for any question about campaign performance, funnel drop-off, cost per acquisition, or which campaigns drove real transfers. Covers Sep 2025 to Sep 2026 (6,167 users, 85 campaigns).",
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe("Filter by campaign name keyword (case-insensitive). Omit to return all campaigns."),
    minSignups: z
      .number()
      .int()
      .optional()
      .describe("Only return campaigns with at least this many signups."),
    sortBy: z
      .enum(["signups", "transfers", "transferRate", "spend", "costPerTransfer"])
      .optional()
      .describe("Sort results by this metric. Defaults to signups."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(85)
      .optional()
      .describe("Max campaigns to return. Defaults to 20."),
    withSpendOnly: z
      .boolean()
      .optional()
      .describe("If true, only return campaigns that have ad spend data joined."),
  }),
  execute: async ({ keyword, minSignups, sortBy = "signups", limit = 20, withSpendOnly = false }) => {
    const artifact = loadCampaignFunnelArtifact();

    if (!artifact) {
      return {
        found: false,
        message: "Campaign funnel data is not available. Run pipeline/xpat-ads/build-campaign-funnel.mjs to generate it.",
      };
    }

    let campaigns = artifact.data.campaigns as Array<Record<string, unknown>>;

    if (keyword) {
      const lower = keyword.toLowerCase();
      campaigns = campaigns.filter((c) =>
        String(c.utmCampaignNormalized ?? "").includes(lower) ||
        (c.adCampaignName && String(c.adCampaignName).toLowerCase().includes(lower)) ||
        (c.utmSources as string[])?.some((s) => s.toLowerCase().includes(lower))
      );
    }

    if (minSignups) {
      campaigns = campaigns.filter((c) => Number(c.signups) >= minSignups);
    }

    if (withSpendOnly) {
      campaigns = campaigns.filter((c) => c.spendUsd !== null);
    }

    campaigns = [...campaigns].sort((a, b) => {
      if (sortBy === "transfers") return Number(b.completedFirstTransfer) - Number(a.completedFirstTransfer);
      if (sortBy === "transferRate") return Number(b.transferRate ?? 0) - Number(a.transferRate ?? 0);
      if (sortBy === "spend") return Number(b.spendUsd ?? 0) - Number(a.spendUsd ?? 0);
      if (sortBy === "costPerTransfer") {
        const bCost = Number(b.costPerTransfer ?? Infinity);
        const aCost = Number(a.costPerTransfer ?? Infinity);
        return aCost - bCost;
      }
      return Number(b.signups) - Number(a.signups);
    });

    const sliced = campaigns.slice(0, limit);

    return {
      found: sliced.length > 0,
      generatedAt: artifact.meta.generatedAt,
      dateRange: "Sep 2025 – Sep 2026",
      totalCampaignsInArtifact: artifact.data.campaigns.length,
      matchedCampaigns: campaigns.length,
      benchmarks: artifact.data.benchmarks,
      note: "transferRate = completed_first_transfer / signups. costPerTransfer = spendUsd / completedFirstTransfer. Campaigns without spendUsd have no ad performance match.",
      campaigns: sliced,
    };
  },
});

function loadCampaignArtifact() {
  if (!existsSync(UTM_CAMPAIGNS_ARTIFACT)) return null;
  try {
    return JSON.parse(readFileSync(UTM_CAMPAIGNS_ARTIFACT, "utf8"));
  } catch {
    return null;
  }
}

export const getCampaignListTool = tool({
  description:
    "Look up the list of real utm_campaign values from XPAT's acquisition database. Use this FIRST when the user asks about a campaign by name — it lets you find the exact utm_campaign value to use in getSignupFunnel or getCampaignAttribution. Returns campaign name, source, medium, user count, and date range. Filter by keyword to narrow results.",
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe(
        "Filter campaigns by keyword (case-insensitive, partial match against utm_campaign, utm_source, or utm_medium). Omit to return the top campaigns by user count.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results to return. Defaults to 20."),
  }),
  execute: async ({ keyword, limit = 20 }) => {
    const artifact = loadCampaignArtifact();

    if (!artifact) {
      return {
        found: false,
        queriedAt: todayIso(),
        message: "Campaign attribution data is not available in this environment.",
      };
    }

    let campaigns: Array<{
      utm_campaign: string;
      utm_source: string;
      utm_medium: string;
      user_count: number;
      first_seen: string;
      last_seen: string;
    }> = artifact.data.campaigns;

    if (keyword) {
      const lower = keyword.toLowerCase();
      campaigns = campaigns.filter(
        (c) =>
          c.utm_campaign?.toLowerCase().includes(lower) ||
          c.utm_source?.toLowerCase().includes(lower) ||
          c.utm_medium?.toLowerCase().includes(lower),
      );
    }

    // Group by utm_campaign name to collapse same-name/different-source variants.
    // This surfaces distinct campaign names with their combined user count.
    const grouped = new Map<string, {
      utm_campaign: string;
      total_users: number;
      sources: string[];
      first_seen: string;
      last_seen: string;
    }>();

    for (const c of campaigns) {
      const key = c.utm_campaign.toLowerCase().trim();
      const existing = grouped.get(key);
      if (existing) {
        existing.total_users += c.user_count;
        if (!existing.sources.includes(c.utm_source)) {
          existing.sources.push(c.utm_source);
        }
        if (c.first_seen < existing.first_seen) existing.first_seen = c.first_seen;
        if (c.last_seen > existing.last_seen) existing.last_seen = c.last_seen;
      } else {
        grouped.set(key, {
          utm_campaign: c.utm_campaign,
          total_users: c.user_count,
          sources: [c.utm_source],
          first_seen: c.first_seen,
          last_seen: c.last_seen,
        });
      }
    }

    const distinctCampaigns = [...grouped.values()]
      .sort((a, b) => b.total_users - a.total_users)
      .slice(0, limit);

    const isAmbiguous = distinctCampaigns.length > 1;

    return {
      found: distinctCampaigns.length > 0,
      totalDistinctCampaigns: distinctCampaigns.length,
      totalRawRows: campaigns.length,
      isAmbiguous,
      queriedAt: todayIso(),
      artifactGeneratedAt: artifact.meta.generatedAt,
      note: isAmbiguous
        ? "Multiple campaigns matched. Present the list to the user and ask them to confirm which campaign they mean before calling getSignupFunnel or getCampaignAttribution."
        : "Single campaign matched. Use the utm_campaign value directly.",
      campaigns: distinctCampaigns,
    };
  },
});


// Returns signups and signup-workflow completions per utm_campaign,
// joined to the userprofile for signup date and status.
// ---------------------------------------------------------------------------

export const getCampaignAttributionTool = tool({
  description:
    "Get real attribution data from XPAT's internal database: actual signups per campaign using UTM parameters captured at signup. Returns signup count and signup-workflow completion count per utm_campaign. Use this to answer questions about which campaigns drove real signups — not platform-reported conversions.",
  inputSchema: z.object({
    utmCampaign: z
      .string()
      .optional()
      .describe(
        "Filter to a specific campaign name or partial match. Omit to get all campaigns.",
      ),
    utmSource: z
      .string()
      .optional()
      .describe(
        "Filter by utm_source, e.g. 'google', 'meta', 'facebook'. Omit for all sources.",
      ),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date filter in YYYY-MM-DD format. Omit for all time."),
    dateTo: z
      .string()
      .optional()
      .describe("End date filter in YYYY-MM-DD format. Omit for all time."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max campaigns to return. Defaults to 20."),
  }),
  execute: async ({ utmCampaign, utmSource, dateFrom, dateTo, limit = 20 }) => {
    if (!hasMetabaseCredentials()) return CONNECTOR_NEEDED;

    const conditions: string[] = ["ad.utm_campaign IS NOT NULL"];

    if (utmCampaign) {
      conditions.push(`ad.utm_campaign LIKE '%${utmCampaign.replace(/'/g, "''")}%'`);
    }
    if (utmSource) {
      conditions.push(`ad.utm_source LIKE '%${utmSource.replace(/'/g, "''")}%'`);
    }
    if (dateFrom) {
      conditions.push(`ad.acquisition_timestamp >= '${dateFrom}'`);
    }
    if (dateTo) {
      conditions.push(`ad.acquisition_timestamp <= '${dateTo} 23:59:59'`);
    }

    const where = conditions.join(" AND ");

    const sql = `
      SELECT
        ad.utm_campaign,
        ad.utm_source,
        ad.utm_medium,
        COUNT(DISTINCT ad.user_id)                                          AS total_signups,
        COUNT(DISTINCT CASE WHEN up.is_signup_workflow_completed = 1
              THEN ad.user_id END)                                          AS signup_workflow_completed,
        MIN(DATE(ad.acquisition_timestamp))                                 AS first_seen,
        MAX(DATE(ad.acquisition_timestamp))                                 AS last_seen
      FROM v_acquisition_data_clean ad
      LEFT JOIN v_userprofile_clean up ON ad.user_id = up.user_id
      WHERE ${where}
      GROUP BY ad.utm_campaign, ad.utm_source, ad.utm_medium
      ORDER BY total_signups DESC
      LIMIT ${limit}
    `.trim();

    const result = await runMetabaseQuery(sql);

    if (result.error) {
      return { found: false, error: result.error, rows: [], queriedAt: todayIso() };
    }

    return {
      found: true,
      rowCount: result.rowCount,
      queriedAt: todayIso(),
      note: "Signups are actual user registrations linked to UTM parameters at acquisition time. signup_workflow_completed means the user finished onboarding.",
      campaigns: result.rows,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 2 — getSignupFunnel
// Returns the conversion funnel for a specific campaign:
// signups → signup workflow completed → KYC status breakdown
// ---------------------------------------------------------------------------

export const getSignupFunnelTool = tool({
  description:
    "Get the signup-to-KYC funnel for a specific utm_campaign from XPAT's internal database. Shows how many users signed up, completed onboarding, and their KYC verification status. Use this to answer questions about funnel drop-off or KYC completion rates per campaign.",
  inputSchema: z.object({
    utmCampaign: z
      .string()
      .describe("The utm_campaign value to analyse. Use exact or partial name."),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date in YYYY-MM-DD format."),
    dateTo: z
      .string()
      .optional()
      .describe("End date in YYYY-MM-DD format."),
  }),
  execute: async ({ utmCampaign, dateFrom, dateTo }) => {
    if (!hasMetabaseCredentials()) return CONNECTOR_NEEDED;

    const dateConditions: string[] = [];
    if (dateFrom) dateConditions.push(`ad.acquisition_timestamp >= '${dateFrom}'`);
    if (dateTo) dateConditions.push(`ad.acquisition_timestamp <= '${dateTo} 23:59:59'`);
    const dateWhere = dateConditions.length > 0 ? `AND ${dateConditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        ad.utm_campaign,
        ad.utm_source,
        COUNT(DISTINCT ad.user_id)                                               AS total_signups,
        COUNT(DISTINCT CASE WHEN up.is_signup_workflow_completed = 1
              THEN ad.user_id END)                                               AS onboarding_completed,
        COUNT(DISTINCT CASE WHEN up.account_status = 'ACTIVE'
              THEN ad.user_id END)                                               AS active_accounts,
        COUNT(DISTINCT kyc.user_id)                                              AS kyc_attempted,
        MIN(DATE(ad.acquisition_timestamp))                                      AS cohort_start,
        MAX(DATE(ad.acquisition_timestamp))                                      AS cohort_end
      FROM v_acquisition_data_clean ad
      LEFT JOIN v_userprofile_clean up ON ad.user_id = up.user_id
      LEFT JOIN v_userkycdetails_clean kyc ON ad.user_id = kyc.user_id
      WHERE ad.utm_campaign LIKE '%${utmCampaign.replace(/'/g, "''")}%'
        ${dateWhere}
      GROUP BY ad.utm_campaign, ad.utm_source
      ORDER BY total_signups DESC
      LIMIT 10
    `.trim();

    const result = await runMetabaseQuery(sql);

    if (result.error) {
      return { found: false, error: result.error, rows: [], queriedAt: todayIso() };
    }

    if (result.rowCount === 0) {
      return {
        found: false,
        queriedAt: todayIso(),
        message: `No acquisition data found for campaign matching '${utmCampaign}'. The utm_campaign value may not match exactly.`,
      };
    }

    return {
      found: true,
      rowCount: result.rowCount,
      queriedAt: todayIso(),
      note: "Funnel counts are based on UTM parameters captured at signup. KYC data reflects current status, not status at time of signup.",
      funnel: result.rows,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 3 — getTransactionsBySource
// Returns transaction counts per utm_source or utm_campaign —
// users who actually sent money after being acquired via ads.
// ---------------------------------------------------------------------------

export const getTransactionsBySourceTool = tool({
  description:
    "Get the number of users who made at least one transaction (money transfer), grouped by the utm_campaign or utm_source that acquired them. Use this to answer questions about which campaigns drove real transfers, not just signups.",
  inputSchema: z.object({
    groupBy: z
      .enum(["utm_campaign", "utm_source", "utm_medium"])
      .optional()
      .describe("Which UTM dimension to group by. Defaults to utm_campaign."),
    utmCampaign: z
      .string()
      .optional()
      .describe("Filter to a specific campaign name or partial match."),
    utmSource: z
      .string()
      .optional()
      .describe("Filter by utm_source, e.g. 'google', 'meta'."),
    dateFrom: z
      .string()
      .optional()
      .describe("Acquisition date start in YYYY-MM-DD format."),
    dateTo: z
      .string()
      .optional()
      .describe("Acquisition date end in YYYY-MM-DD format."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max rows to return. Defaults to 20."),
  }),
  execute: async ({ groupBy = "utm_campaign", utmCampaign, utmSource, dateFrom, dateTo, limit = 20 }) => {
    if (!hasMetabaseCredentials()) return CONNECTOR_NEEDED;

    const conditions: string[] = ["ad.utm_campaign IS NOT NULL"];

    if (utmCampaign) {
      conditions.push(`ad.utm_campaign LIKE '%${utmCampaign.replace(/'/g, "''")}%'`);
    }
    if (utmSource) {
      conditions.push(`ad.utm_source LIKE '%${utmSource.replace(/'/g, "''")}%'`);
    }
    if (dateFrom) {
      conditions.push(`ad.acquisition_timestamp >= '${dateFrom}'`);
    }
    if (dateTo) {
      conditions.push(`ad.acquisition_timestamp <= '${dateTo} 23:59:59'`);
    }

    const where = conditions.join(" AND ");

    const sql = `
      SELECT
        ad.${groupBy}                                                     AS dimension,
        COUNT(DISTINCT ad.user_id)                                        AS users_acquired,
        COUNT(DISTINCT t.user_id)                                         AS users_transacted,
        COUNT(t.user_id)                                                  AS total_transactions,
        ROUND(
          COUNT(DISTINCT t.user_id) * 100.0 / NULLIF(COUNT(DISTINCT ad.user_id), 0),
          1
        )                                                                 AS transaction_rate_pct
      FROM v_acquisition_data_clean ad
      LEFT JOIN transaction t ON ad.user_id = t.user_id
      WHERE ${where}
      GROUP BY ad.${groupBy}
      ORDER BY users_transacted DESC
      LIMIT ${limit}
    `.trim();

    const result = await runMetabaseQuery(sql);

    if (result.error) {
      return { found: false, error: result.error, rows: [], queriedAt: todayIso() };
    }

    return {
      found: true,
      groupedBy: groupBy,
      rowCount: result.rowCount,
      queriedAt: todayIso(),
      note: "users_transacted = users who made at least one money transfer after being acquired via this campaign. transaction_rate_pct = percentage of acquired users who transacted.",
      data: result.rows,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool 4 (snapshot) — getAttributionSnapshot
// Reads the pre-fetched attribution snapshot artifact from disk.
// Use this FIRST for any attribution question — it covers signups, KYC,
// and transaction rates per campaign for the last 90 days without a live
// Metabase call. Only fall back to live tools for date ranges or filters
// the snapshot cannot cover.
// ---------------------------------------------------------------------------

const ATTRIBUTION_SNAPSHOT_ARTIFACT = join(
  process.cwd(),
  "data",
  "artifacts",
  "attribution-snapshot.json",
);

function loadAttributionSnapshot() {
  if (!existsSync(ATTRIBUTION_SNAPSHOT_ARTIFACT)) return null;
  try {
    return JSON.parse(readFileSync(ATTRIBUTION_SNAPSHOT_ARTIFACT, "utf8"));
  } catch {
    return null;
  }
}

export const getAttributionSnapshotTool = tool({
  description:
    "Read the pre-fetched attribution snapshot covering signups, onboarding completion, KYC attempts, and transaction rates per campaign for the last 90 days. Use this FIRST before calling any live attribution tools — it answers most campaign attribution questions without a live database call. Filter by keyword to find a specific campaign.",
  inputSchema: z.object({
    keyword: z
      .string()
      .optional()
      .describe(
        "Filter campaigns by keyword (case-insensitive, partial match against utm_campaign or utm_source). Omit to return top campaigns by signup count.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max campaigns to return. Defaults to 20."),
    sortBy: z
      .enum(["signups", "transacted", "kyc", "transaction_rate"])
      .optional()
      .describe("Sort results by this metric. Defaults to signups."),
  }),
  execute: async ({ keyword, limit = 20, sortBy = "signups" }) => {
    const snapshot = loadAttributionSnapshot();

    if (!snapshot) {
      return {
        found: false,
        snapshotAvailable: false,
        message:
          "Attribution snapshot is not available. Run pipeline/xpat-ads/fetch-attribution-snapshot.mjs to generate it.",
      };
    }

    let campaigns: Array<Record<string, unknown>> = snapshot.data.campaigns;

    if (keyword) {
      const lower = keyword.toLowerCase();
      campaigns = campaigns.filter(
        (c: Record<string, unknown>) =>
          String(c.utm_campaign ?? "").toLowerCase().includes(lower) ||
          String(c.utm_source ?? "").toLowerCase().includes(lower),
      );
    }

    // Sort
    campaigns = [...campaigns].sort((a, b) => {
      if (sortBy === "transacted") return (Number(b.users_transacted) || 0) - (Number(a.users_transacted) || 0);
      if (sortBy === "kyc") return (Number(b.kyc_attempted) || 0) - (Number(a.kyc_attempted) || 0);
      if (sortBy === "transaction_rate") return (Number(b.transaction_rate_pct) || 0) - (Number(a.transaction_rate_pct) || 0);
      return (Number(b.total_signups) || 0) - (Number(a.total_signups) || 0);
    });

    const sliced = campaigns.slice(0, limit);

    return {
      found: sliced.length > 0,
      snapshotAvailable: true,
      snapshotGeneratedAt: snapshot.meta.generatedAt,
      windowDays: snapshot.meta.windowDays,
      totalCampaignsInSnapshot: snapshot.data.totalCampaigns,
      matchedCampaigns: campaigns.length,
      campaigns: sliced,
      note: `Snapshot covers the last ${snapshot.meta.windowDays} days as of ${snapshot.meta.generatedAt.slice(0, 10)}. For different date ranges, use getCampaignAttribution or getSignupFunnel.`,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: getCampaignUsers
// Returns user IDs for a specific campaign from the Metabase CSV dump.
// Internal use only — for XPAT marketing team to cross-reference in CRM.
// ---------------------------------------------------------------------------

const CAMPAIGN_CSV_PATH = process.env.CAMPAIGN_CSV_PATH ??
  join(process.cwd(), "data", "artifacts", "online_campaign_signup_performance_12m.csv");

function loadCampaignCsvUsers(campaign: string, limit: number, filterFn?: (row: Record<string, string>) => boolean) {
  try {
    if (!existsSync(CAMPAIGN_CSV_PATH)) return null;
    const lines = readFileSync(CAMPAIGN_CSV_PATH, "utf8").split("\n").filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows: Record<string, string>[] = lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
      return obj;
    });

    const campaignLower = campaign.toLowerCase();
    const matched = rows.filter((r) => {
      const normCampaign = (r.utm_campaign_normalized || r.utm_campaign || "").toLowerCase();
      const matchesCampaign = normCampaign.includes(campaignLower) || campaignLower.includes(normCampaign);
      return matchesCampaign && (!filterFn || filterFn(r));
    });

    return matched.slice(0, limit).map((r) => ({
      userId: r.user_id,
      signupDate: r.signup_date,
      utmSource: r.utm_source,
      utmCampaign: r.utm_campaign_normalized || r.utm_campaign,
      phoneStatus: r.phone_status,
      usBankAdded: r.us_bank_added,
      indianBankAdded: r.indian_bank_added,
      completedFirstTransfer: r.completed_first_transfer,
      firstTransferDate: r.first_transfer_date || null,
    }));
  } catch {
    return null;
  }
}

export const getCampaignUsersTool = tool({
  description:
    "Get individual user IDs for a specific campaign from the Metabase signup data. Internal use only — for XPAT marketing team to cross-reference users in CRM or support tools. Can filter to only users who completed a specific funnel stage.",
  inputSchema: z.object({
    campaign: z
      .string()
      .describe("Campaign name or keyword to filter (e.g. 'cr_profile', 'generic_search')."),
    funnelStage: z
      .enum(["all", "phone_verified", "us_bank_added", "indian_bank_added", "transferred"])
      .optional()
      .describe("Filter to users who reached a specific funnel stage. Defaults to all signups."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max users to return. Defaults to 20."),
  }),
  execute: async ({ campaign, funnelStage = "all", limit = 20 }) => {
    const filterFn = funnelStage === "all" ? undefined :
      funnelStage === "phone_verified" ? (r: Record<string, string>) => r.phone_status === "added_verified" :
      funnelStage === "us_bank_added" ? (r: Record<string, string>) => r.us_bank_added === "Y" :
      funnelStage === "indian_bank_added" ? (r: Record<string, string>) => r.indian_bank_added === "Y" :
      funnelStage === "transferred" ? (r: Record<string, string>) => r.completed_first_transfer === "Y" :
      undefined;

    const users = loadCampaignCsvUsers(campaign, limit, filterFn);

    if (!users) {
      return {
        found: false,
        message: "Campaign user data is not available. The CSV file may not be present on this machine.",
      };
    }

    return {
      found: users.length > 0,
      campaign,
      funnelStage,
      returnedCount: users.length,
      note: "user_id values are pseudonymous internal identifiers. Use these to look up users in XPAT's CRM or Metabase.",
      users,
    };
  },
});

// ---------------------------------------------------------------------------
// Time-series helpers — shared CSV loader for day/week tools
// ---------------------------------------------------------------------------

interface CsvRow {
  user_id: string;
  signup_date: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_campaign_normalized: string;
  phone_status: string;
  us_bank_added: string;
  indian_bank_added: string;
  completed_first_transfer: string;
  first_transfer_date: string;
  landing_page: string;
  [key: string]: string;
}

function loadAllCsvRows(): CsvRow[] | null {
  try {
    if (!existsSync(CAMPAIGN_CSV_PATH)) return null;
    const lines = readFileSync(CAMPAIGN_CSV_PATH, "utf8").split("\n").filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const vals = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
      return obj as CsvRow;
    });
  } catch {
    return null;
  }
}

/**
 * Builds a map of gad_campaignid → Set<utm_campaign_normalized> from landing_page URLs.
 * This is the only reliable way to group UTM aliases that belong to the same Google Ads
 * campaign — gad_campaignid is appended by Google to every ad click URL automatically.
 *
 * Example: EDM_Search_Brand_260526 (ID 23875790790) has two UTM aliases:
 *   edm_search_brand_260526 and ga-edm — both have gad_campaignid=23875790790 in the URL.
 */
function buildCampaignIdToUtmMap(rows: CsvRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const match = (row.landing_page ?? "").match(/gad_campaignid=(\d+)/);
    if (!match) continue;
    const gadId = match[1];
    const utm = (row.utm_campaign_normalized || row.utm_campaign || "").toLowerCase();
    if (!utm) continue;
    if (!map.has(gadId)) map.set(gadId, new Set());
    map.get(gadId)!.add(utm);
  }
  return map;
}

/**
 * Given a campaign keyword, returns the Set of all UTM normalized values that
 * belong to the same Google Ads campaign (via gad_campaignid).
 * Falls back to keyword-only matching if no gad_campaignid match found.
 */
function resolveUtmAliases(keyword: string, rows: CsvRow[]): Set<string> | null {
  const lower = keyword.toLowerCase();
  const gadMap = buildCampaignIdToUtmMap(rows);

  // Find which gad_campaignid this keyword matches (by checking if any of its UTM
  // aliases contain the keyword, or if the keyword contains an alias)
  for (const [, utmSet] of gadMap) {
    for (const utm of utmSet) {
      if (utm.includes(lower) || lower.includes(utm)) {
        // Found the campaign group — return all aliases
        return utmSet;
      }
    }
  }

  // No gad_campaignid grouping found — return null to fall back to keyword match
  return null;
}

/** Returns ISO week label e.g. "2026-W03" for any YYYY-MM-DD date */
function toIsoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Returns the max signup_date present in the CSV rows */
function getCsvMaxDate(rows: CsvRow[]): string {
  let max = "";
  for (const row of rows) {
    const d = row.signup_date?.slice(0, 10);
    if (d && d > max) max = d;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Tool: getSignupsByDay
// ---------------------------------------------------------------------------

export const getSignupsByDayTool = tool({
  description:
    "Get daily signup and transfer counts over time. Use for trend questions like 'how did signups trend in August?' or 'compare campaign A vs B day by day'. Supports filtering by campaign keyword and date range. Can return one campaign or two campaigns side-by-side for comparison.",
  inputSchema: z.object({
    campaign: z
      .string()
      .optional()
      .describe("Campaign name or keyword to filter (case-insensitive, partial match). Omit to aggregate all campaigns."),
    compareCampaign: z
      .string()
      .optional()
      .describe("Second campaign keyword for side-by-side comparison. When provided, returns two series."),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date YYYY-MM-DD (inclusive). Defaults to 30 days ago if omitted."),
    dateTo: z
      .string()
      .optional()
      .describe("End date YYYY-MM-DD (inclusive). Defaults to today."),
    metric: z
      .enum(["signups", "transfers", "both"])
      .optional()
      .describe("Which metric to return. Defaults to both."),
  }),
  execute: async ({ campaign, compareCampaign, dateFrom, dateTo, metric = "both" }) => {
    const rows = loadAllCsvRows();
    if (!rows) {
      return { found: false, message: "Campaign user data is not available." };
    }

    const csvMaxDate = getCsvMaxDate(rows);
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from = dateFrom ?? defaultFrom;
    const to = dateTo ?? today;

    // Out-of-range check: if the entire requested window is beyond CSV data
    if (from > csvMaxDate) {
      return {
        found: false,
        dataAvailableUpTo: csvMaxDate,
        message: `Data is available up to ${csvMaxDate}. No signup data is available for the requested dates.`,
      };
    }

    // Cap 'to' at csvMaxDate silently so we don't return zeros for future dates
    const effectiveTo = to > csvMaxDate ? csvMaxDate : to;

    // Resolve all UTM aliases for a campaign keyword via gad_campaignid
    function matchesKeyword(row: CsvRow, keyword: string, aliases: Set<string> | null): boolean {
      const utm = (row.utm_campaign_normalized || row.utm_campaign || "").toLowerCase();
      if (aliases) return aliases.has(utm);
      return utm.includes(keyword.toLowerCase());
    }

    function buildDailySeries(keyword: string | undefined): Record<string, { signups: number; transfers: number }> {
      const aliases = keyword ? resolveUtmAliases(keyword, rows!) : null;
      const series: Record<string, { signups: number; transfers: number }> = {};
      for (const row of rows!) {
        const signupDay = row.signup_date?.slice(0, 10);
        if (!signupDay || signupDay < from || signupDay > effectiveTo) continue;
        if (keyword && !matchesKeyword(row, keyword, aliases)) continue;
        if (!series[signupDay]) series[signupDay] = { signups: 0, transfers: 0 };
        series[signupDay].signups++;
        if (row.completed_first_transfer === "Y") series[signupDay].transfers++;
      }
      return series;
    }

    const primarySeries = buildDailySeries(campaign);
    const primaryDays = Object.keys(primarySeries).sort();

    if (compareCampaign) {
      const compareSeries = buildDailySeries(compareCampaign);
      const allDays = [...new Set([...primaryDays, ...Object.keys(compareSeries)])].sort();
      const rows_out = allDays.map((day) => {
        const p = primarySeries[day] ?? { signups: 0, transfers: 0 };
        const c = compareSeries[day] ?? { signups: 0, transfers: 0 };
        const entry: Record<string, unknown> = { date: day };
        if (metric !== "transfers") { entry[`${campaign ?? "all"}_signups`] = p.signups; entry[`${compareCampaign}_signups`] = c.signups; }
        if (metric !== "signups") { entry[`${campaign ?? "all"}_transfers`] = p.transfers; entry[`${compareCampaign}_transfers`] = c.transfers; }
        return entry;
      });
      return {
        found: rows_out.length > 0,
        mode: "comparison",
        dataAvailableUpTo: csvMaxDate,
        dateRange: `${from} to ${effectiveTo}`,
        totalDays: rows_out.length,
        series: rows_out,
      };
    }

    const rows_out = primaryDays.map((day) => {
      const d = primarySeries[day];
      const entry: Record<string, unknown> = { date: day };
      if (metric !== "transfers") entry.signups = d.signups;
      if (metric !== "signups") entry.transfers = d.transfers;
      return entry;
    });

    const totalSignups = rows_out.reduce((s, r) => s + (Number(r.signups) || 0), 0);
    const totalTransfers = rows_out.reduce((s, r) => s + (Number(r.transfers) || 0), 0);

    return {
      found: rows_out.length > 0,
      mode: "single",
      campaign: campaign ?? "all campaigns",
      dataAvailableUpTo: csvMaxDate,
      dateRange: `${from} to ${effectiveTo}`,
      totalDays: rows_out.length,
      totalSignups,
      totalTransfers,
      daily: rows_out,
    };
  },
});

// ---------------------------------------------------------------------------
// Tool: getSignupsByWeek
// ---------------------------------------------------------------------------

export const getSignupsByWeekTool = tool({
  description:
    "Get weekly signup and transfer counts over time (grouped by ISO week Mon-Sun). Use for questions like 'which week had the most signups?', 'show me week-over-week trend for August', or 'compare two campaigns week by week'. Supports campaign keyword filter and date range.",
  inputSchema: z.object({
    campaign: z
      .string()
      .optional()
      .describe("Campaign name or keyword to filter (case-insensitive, partial match). Omit to aggregate all campaigns."),
    compareCampaign: z
      .string()
      .optional()
      .describe("Second campaign keyword for side-by-side weekly comparison."),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date YYYY-MM-DD. Defaults to 90 days ago."),
    dateTo: z
      .string()
      .optional()
      .describe("End date YYYY-MM-DD. Defaults to today."),
    metric: z
      .enum(["signups", "transfers", "both"])
      .optional()
      .describe("Which metric to return. Defaults to both."),
  }),
  execute: async ({ campaign, compareCampaign, dateFrom, dateTo, metric = "both" }) => {
    const rows = loadAllCsvRows();
    if (!rows) {
      return { found: false, message: "Campaign user data is not available." };
    }

    const csvMaxDate = getCsvMaxDate(rows);
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const from = dateFrom ?? defaultFrom;
    const to = dateTo ?? today;

    // Out-of-range check
    if (from > csvMaxDate) {
      return {
        found: false,
        dataAvailableUpTo: csvMaxDate,
        message: `Data is available up to ${csvMaxDate}. No signup data is available for the requested dates.`,
      };
    }

    const effectiveTo = to > csvMaxDate ? csvMaxDate : to;

    function matchesKeyword(row: CsvRow, keyword: string, aliases: Set<string> | null): boolean {
      const utm = (row.utm_campaign_normalized || row.utm_campaign || "").toLowerCase();
      if (aliases) return aliases.has(utm);
      return utm.includes(keyword.toLowerCase());
    }

    function buildWeeklySeries(keyword: string | undefined): Record<string, { signups: number; transfers: number; weekStart: string }> {
      const aliases = keyword ? resolveUtmAliases(keyword, rows!) : null;
      const series: Record<string, { signups: number; transfers: number; weekStart: string }> = {};
      for (const row of rows!) {
        const signupDay = row.signup_date?.slice(0, 10);
        if (!signupDay || signupDay < from || signupDay > effectiveTo) continue;
        if (keyword && !matchesKeyword(row, keyword, aliases)) continue;
        const week = toIsoWeek(signupDay);
        const d = new Date(signupDay);
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const weekStart = monday.toISOString().slice(0, 10);
        if (!series[week]) series[week] = { signups: 0, transfers: 0, weekStart };
        series[week].signups++;
        if (row.completed_first_transfer === "Y") series[week].transfers++;
      }
      return series;
    }

    const primarySeries = buildWeeklySeries(campaign);
    const primaryWeeks = Object.keys(primarySeries).sort();

    if (compareCampaign) {
      const compareSeries = buildWeeklySeries(compareCampaign);
      const allWeeks = [...new Set([...primaryWeeks, ...Object.keys(compareSeries)])].sort();
      const rows_out = allWeeks.map((week) => {
        const p = primarySeries[week] ?? { signups: 0, transfers: 0, weekStart: "" };
        const c = compareSeries[week] ?? { signups: 0, transfers: 0, weekStart: "" };
        const entry: Record<string, unknown> = { week, weekStart: p.weekStart || c.weekStart };
        if (metric !== "transfers") { entry[`${campaign ?? "all"}_signups`] = p.signups; entry[`${compareCampaign}_signups`] = c.signups; }
        if (metric !== "signups") { entry[`${campaign ?? "all"}_transfers`] = p.transfers; entry[`${compareCampaign}_transfers`] = c.transfers; }
        return entry;
      });
      return {
        found: rows_out.length > 0,
        mode: "comparison",
        dataAvailableUpTo: csvMaxDate,
        dateRange: `${from} to ${effectiveTo}`,
        totalWeeks: rows_out.length,
        weekly: rows_out,
      };
    }

    const rows_out = primaryWeeks.map((week) => {
      const d = primarySeries[week];
      const entry: Record<string, unknown> = { week, weekStart: d.weekStart };
      if (metric !== "transfers") entry.signups = d.signups;
      if (metric !== "signups") entry.transfers = d.transfers;
      return entry;
    });

    const totalSignups = rows_out.reduce((s, r) => s + (Number(r.signups) || 0), 0);
    const totalTransfers = rows_out.reduce((s, r) => s + (Number(r.transfers) || 0), 0);

    return {
      found: rows_out.length > 0,
      mode: "single",
      campaign: campaign ?? "all campaigns",
      dataAvailableUpTo: csvMaxDate,
      dateRange: `${from} to ${effectiveTo}`,
      totalWeeks: rows_out.length,
      totalSignups,
      totalTransfers,
      weekly: rows_out,
    };
  },
});
// ---------------------------------------------------------------------------
// Exported tools map
// ---------------------------------------------------------------------------

export const metabaseTools = {
  getCampaignList: getCampaignListTool,
  getActiveCampaignFunnel: getActiveCampaignFunnelTool,
  getCampaignFunnel: getCampaignFunnelTool,
  getCampaignUsers: getCampaignUsersTool,
  getGoogleAdsInsights: getGoogleAdsInsightsTool,
  getAttributionSnapshot: getAttributionSnapshotTool,
  getCampaignAttribution: getCampaignAttributionTool,
  getSignupFunnel: getSignupFunnelTool,
  getTransactionsBySource: getTransactionsBySourceTool,
  getSignupsByDay: getSignupsByDayTool,
  getSignupsByWeek: getSignupsByWeekTool,
};
