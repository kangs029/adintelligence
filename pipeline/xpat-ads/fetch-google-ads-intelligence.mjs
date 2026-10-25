/**
 * pipeline/xpat-ads/fetch-google-ads-intelligence.mjs
 *
 * Pulls every field the ad analyst needs from Google Ads API v25 via GAQL.
 * Writes data/artifacts/google-ads-intelligence.json
 *
 * Data pulled (7 queries):
 *   1. Campaign + ad group daily metrics  (spend, clicks, impressions, conversions, CTR, CPC)
 *   2. Keyword view                       (keyword text, match type, spend, conversions per day)
 *   3. Search term view                   (actual query, spend, clicks, conversions, match type)
 *   4. Ad group ad (ad copy)              (headlines, descriptions, ad strength, final URL)
 *   5. Geographic view                    (country/region, spend, conversions)
 *   6. Device breakdown                   (device, spend, clicks, conversions per campaign)
 *   7. Conversion actions                 (conversion name, type, status, counts)
 *
 * Note: Auction Insights are not available via GAQL — they must be exported manually
 *       from the Google Ads UI (Auction insights report.csv). Use ingest-google-reports.mjs.
 *
 * Usage:
 *   node --env-file=.env.local pipeline/xpat-ads/fetch-google-ads-intelligence.mjs
 *   node --env-file=.env.local pipeline/xpat-ads/fetch-google-ads-intelligence.mjs --days 30
 *
 * Env vars required:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (optional, same as CUSTOMER_ID for non-MCC accounts)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const ARTIFACT_PATH = join("data", "artifacts", "google-ads-intelligence.json");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const daysArg = process.argv.indexOf("--days");
const LOOKBACK_DAYS = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 90;

function dateRange() {
  const to = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// OAuth token refresh
// ---------------------------------------------------------------------------

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token refresh HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Token refresh did not return access_token");
  return json.access_token;
}

// ---------------------------------------------------------------------------
// GAQL query runner (handles pagination)
// ---------------------------------------------------------------------------

async function runQuery({ accessToken, customerId, loginCustomerId, developerToken, query, label }) {
  const cleanId = customerId.replace(/-/g, "");
  const url = `${GOOGLE_ADS_API_BASE}/customers/${cleanId}/googleAds:search`;

  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "developer-token": developerToken,
  };
  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  }

  const allRows = [];
  let pageToken = null;
  let page = 0;
  const MAX_PAGES = 100;

  do {
    const body = { query };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`[${label}] Google Ads API HTTP ${res.status}: ${errBody.slice(0, 500)}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(`[${label}] Google Ads API error ${json.error.code}: ${json.error.message}`);
    }

    allRows.push(...(json.results ?? []));
    pageToken = json.nextPageToken ?? null;
    page++;
    console.log(`  [${label}] page ${page}: ${(json.results ?? []).length} rows (total ${allRows.length})`);
  } while (pageToken && page < MAX_PAGES);

  return allRows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function micros(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n / 1_000_000 * 100) / 100 : null;
}

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 10000) / 100 : null; // raw decimal → %
}

function str(v) {
  return v != null ? String(v).trim() : null;
}

// ---------------------------------------------------------------------------
// Query 1 — Campaign + ad group daily metrics
// ---------------------------------------------------------------------------

function buildCampaignQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.bidding_strategy_type,
      ad_group.id,
      ad_group.name,
      ad_group.status,
      ad_group.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.conversions,
      metrics.conversions_value,
      metrics.cost_per_conversion,
      metrics.all_conversions,
      metrics.view_through_conversions,
      segments.date
    FROM ad_group
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY segments.date DESC
    LIMIT 10000
  `.trim();
}

function normalizeCampaignRow(row) {
  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    campaignStatus: str(row.campaign?.status),
    channelType: str(row.campaign?.advertisingChannelType),
    channelSubType: str(row.campaign?.advertisingChannelSubType),
    biddingStrategy: str(row.campaign?.biddingStrategyType),
    adGroupId: str(row.adGroup?.id),
    adGroupName: str(row.adGroup?.name),
    adGroupStatus: str(row.adGroup?.status),
    adGroupType: str(row.adGroup?.type),
    date: str(row.segments?.date),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    avgCpcUsd: micros(row.metrics?.averageCpc),
    avgCpmUsd: micros(row.metrics?.averageCpm),
    conversions: num(row.metrics?.conversions),
    conversionsValue: num(row.metrics?.conversionsValue),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
    allConversions: num(row.metrics?.allConversions),
    viewThroughConversions: num(row.metrics?.viewThroughConversions),
  };
}

// ---------------------------------------------------------------------------
// Query 2 — Keyword view
// ---------------------------------------------------------------------------

function buildKeywordQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      ad_group.id,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM keyword_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND ad_group_criterion.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 10000
  `.trim();
}

function normalizeKeywordRow(row) {
  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    campaignStatus: str(row.campaign?.status),
    adGroupId: str(row.adGroup?.id),
    adGroupName: str(row.adGroup?.name),
    keyword: str(row.adGroupCriterion?.keyword?.text),
    matchType: str(row.adGroupCriterion?.keyword?.matchType),
    keywordStatus: str(row.adGroupCriterion?.status),
    qualityScore: num(row.adGroupCriterion?.qualityInfo?.qualityScore) || null,
    predictedCtr: null,
    adRelevance: null,
    landingPageExp: null,
    date: str(row.segments?.date),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    avgCpcUsd: micros(row.metrics?.averageCpc),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// ---------------------------------------------------------------------------
// Query 3 — Search term view
// ---------------------------------------------------------------------------

function buildSearchTermQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      search_term_view.search_term,
      search_term_view.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM search_term_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 10000
  `.trim();
}

function normalizeSearchTermRow(row) {
  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    adGroupId: str(row.adGroup?.id),
    adGroupName: str(row.adGroup?.name),
    searchTerm: str(row.searchTermView?.searchTerm),
    searchTermStatus: str(row.searchTermView?.status),
    date: str(row.segments?.date),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    avgCpcUsd: micros(row.metrics?.averageCpc),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// ---------------------------------------------------------------------------
// Query 4 — Ad copy (ad_group_ad)
// ---------------------------------------------------------------------------

function buildAdCopyQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.expanded_text_ad.headline_part1,
      ad_group_ad.ad.expanded_text_ad.headline_part2,
      ad_group_ad.ad.expanded_text_ad.headline_part3,
      ad_group_ad.ad.expanded_text_ad.description,
      ad_group_ad.ad.expanded_text_ad.description2,
      ad_group_ad.ad_strength,
      ad_group_ad.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions,
      metrics.cost_per_conversion
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY metrics.conversions DESC
    LIMIT 2000
  `.trim();
}

function normalizeAdCopyRow(row) {
  const ad = row.adGroupAd?.ad ?? {};
  const rsa = ad.responsiveSearchAd ?? {};
  const eta = ad.expandedTextAd ?? {};

  // Extract RSA headlines (array of pinned/unpinned asset text)
  const headlines = (rsa.headlines ?? []).map(h => h.text).filter(Boolean);
  const descriptions = (rsa.descriptions ?? []).map(d => d.text).filter(Boolean);

  // Fallback to ETA fields
  const headline1 = eta.headlinePart1 || headlines[0] || null;
  const headline2 = eta.headlinePart2 || headlines[1] || null;
  const headline3 = eta.headlinePart3 || headlines[2] || null;
  const description1 = eta.description || descriptions[0] || null;
  const description2 = eta.description2 || descriptions[1] || null;

  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    adGroupId: str(row.adGroup?.id),
    adGroupName: str(row.adGroup?.name),
    adId: str(ad.id),
    adType: str(ad.type),
    adStatus: str(row.adGroupAd?.status),
    adStrength: str(row.adGroupAd?.adStrength),
    finalUrls: (ad.finalUrls ?? []).join(", ") || null,
    headline1,
    headline2,
    headline3,
    allHeadlines: headlines.length > 0 ? headlines : null,
    description1,
    description2,
    allDescriptions: descriptions.length > 0 ? descriptions : null,
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// ---------------------------------------------------------------------------
// Query 5 — Geographic view
// ---------------------------------------------------------------------------

function buildGeoQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      geographic_view.country_criterion_id,
      geographic_view.location_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM geographic_view
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY metrics.cost_micros DESC
    LIMIT 5000
  `.trim();
}

function normalizeGeoRow(row) {
  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    countryCriterionId: str(row.geographicView?.countryCriterionId),
    locationType: str(row.geographicView?.locationType),
    geoState: null,
    date: str(row.segments?.date),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    avgCpcUsd: micros(row.metrics?.averageCpc),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// ---------------------------------------------------------------------------
// Query 6 — Device breakdown
// ---------------------------------------------------------------------------

function buildDeviceQuery(from, to) {
  return `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      segments.device,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions,
      metrics.cost_per_conversion,
      segments.date
    FROM ad_group
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY segments.date DESC, metrics.cost_micros DESC
    LIMIT 10000
  `.trim();
}

function normalizeDeviceRow(row) {
  return {
    campaignId: str(row.campaign?.id),
    campaignName: str(row.campaign?.name),
    adGroupId: str(row.adGroup?.id),
    adGroupName: str(row.adGroup?.name),
    device: str(row.segments?.device),
    date: str(row.segments?.date),
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    avgCpcUsd: micros(row.metrics?.averageCpc),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// ---------------------------------------------------------------------------
// Query 7 — Conversion actions
// ---------------------------------------------------------------------------

function buildConversionQuery() {
  return `
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.status,
      conversion_action.type,
      conversion_action.counting_type,
      conversion_action.category,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.include_in_conversions_metric
    FROM conversion_action
    WHERE conversion_action.status != 'REMOVED'
    ORDER BY conversion_action.name
    LIMIT 200
  `.trim();
}

function normalizeConversionRow(row) {
  const ca = row.conversionAction ?? {};
  return {
    conversionActionId: str(ca.id),
    name: str(ca.name),
    status: str(ca.status),
    type: str(ca.type),
    countingType: str(ca.countingType),
    category: str(ca.category),
    defaultValue: num(ca.valueSettings?.defaultValue) || null,
    alwaysUseDefaultValue: ca.valueSettings?.alwaysUseDefaultValue ?? null,
    includeInConversions: ca.includeInConversionsMetric ?? null,
    includeInAllConversions: null,
    conversions: null,
    allConversions: null,
  };
}

// ---------------------------------------------------------------------------
// Rollups — pre-aggregate for fast analyst queries
// ---------------------------------------------------------------------------

function rollupByCampaign(campaignRows) {
  const map = new Map();
  for (const r of campaignRows) {
    const key = r.campaignId;
    if (!map.has(key)) {
      map.set(key, {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        campaignStatus: r.campaignStatus,
        channelType: r.channelType,
        biddingStrategy: r.biddingStrategy,
        impressions: 0, clicks: 0, spendUsd: 0, conversions: 0, allConversions: 0,
        dates: new Set(),
      });
    }
    const c = map.get(key);
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    c.spendUsd += r.spendUsd ?? 0;
    c.conversions += r.conversions;
    c.allConversions += r.allConversions;
    if (r.date) c.dates.add(r.date);
  }

  return [...map.values()].map(c => ({
    ...c,
    ctrPct: c.impressions > 0 ? Math.round(c.clicks / c.impressions * 10000) / 100 : null,
    avgCpcUsd: c.clicks > 0 ? Math.round(c.spendUsd / c.clicks * 100) / 100 : null,
    costPerConversionUsd: c.conversions > 0 ? Math.round(c.spendUsd / c.conversions * 100) / 100 : null,
    activeDays: c.dates.size,
    spendUsd: Math.round(c.spendUsd * 100) / 100,
    dates: undefined,
  })).sort((a, b) => b.spendUsd - a.spendUsd);
}

function rollupKeywordsByCampaign(keywordRows) {
  // Group by campaign, aggregate keyword stats, flag top wasters
  const map = new Map();
  for (const r of keywordRows) {
    const key = `${r.campaignId}|${r.keyword}|${r.matchType}`;
    if (!map.has(key)) {
      map.set(key, {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        adGroupName: r.adGroupName,
        keyword: r.keyword,
        matchType: r.matchType,
        qualityScore: r.qualityScore,
        impressions: 0, clicks: 0, spendUsd: 0, conversions: 0,
      });
    }
    const k = map.get(key);
    k.impressions += r.impressions;
    k.clicks += r.clicks;
    k.spendUsd += r.spendUsd ?? 0;
    k.conversions += r.conversions;
  }

  return [...map.values()].map(k => ({
    ...k,
    ctrPct: k.impressions > 0 ? Math.round(k.clicks / k.impressions * 10000) / 100 : null,
    avgCpcUsd: k.clicks > 0 ? Math.round(k.spendUsd / k.clicks * 100) / 100 : null,
    costPerConversionUsd: k.conversions > 0 ? Math.round(k.spendUsd / k.conversions * 100) / 100 : null,
    spendUsd: Math.round(k.spendUsd * 100) / 100,
    // Flag zero-conversion keywords with meaningful spend
    isWastedSpend: k.conversions === 0 && k.spendUsd > 5,
    isHighCpc: k.spendUsd > 0 && k.clicks > 0 && (k.spendUsd / k.clicks) > 10,
  })).sort((a, b) => b.spendUsd - a.spendUsd);
}

function rollupSearchTerms(searchTermRows) {
  const map = new Map();
  for (const r of searchTermRows) {
    const key = `${r.campaignId}|${r.searchTerm}`;
    if (!map.has(key)) {
      map.set(key, {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        adGroupName: r.adGroupName,
        searchTerm: r.searchTerm,
        searchTermStatus: r.searchTermStatus,
        impressions: 0, clicks: 0, spendUsd: 0, conversions: 0,
      });
    }
    const s = map.get(key);
    s.impressions += r.impressions;
    s.clicks += r.clicks;
    s.spendUsd += r.spendUsd ?? 0;
    s.conversions += r.conversions;
  }

  return [...map.values()].map(s => ({
    ...s,
    ctrPct: s.impressions > 0 ? Math.round(s.clicks / s.impressions * 10000) / 100 : null,
    avgCpcUsd: s.clicks > 0 ? Math.round(s.spendUsd / s.clicks * 100) / 100 : null,
    spendUsd: Math.round(s.spendUsd * 100) / 100,
    isLowIntent: s.impressions > 50 && (s.clicks / s.impressions) < 0.01 && s.conversions === 0,
    isHighIntent: (s.clicks / Math.max(s.impressions, 1)) >= 0.1 && s.conversions > 0,
    isWastedSpend: s.conversions === 0 && s.spendUsd > 5,
  })).sort((a, b) => b.spendUsd - a.spendUsd);
}

function rollupDevices(deviceRows) {
  const map = new Map();
  for (const r of deviceRows) {
    const key = r.device;
    if (!map.has(key)) {
      map.set(key, {
        device: r.device,
        impressions: 0, clicks: 0, spendUsd: 0, conversions: 0,
      });
    }
    const d = map.get(key);
    d.impressions += r.impressions;
    d.clicks += r.clicks;
    d.spendUsd += r.spendUsd ?? 0;
    d.conversions += r.conversions;
  }

  return [...map.values()].map(d => ({
    ...d,
    ctrPct: d.impressions > 0 ? Math.round(d.clicks / d.impressions * 10000) / 100 : null,
    avgCpcUsd: d.clicks > 0 ? Math.round(d.spendUsd / d.clicks * 100) / 100 : null,
    costPerConversionUsd: d.conversions > 0 ? Math.round(d.spendUsd / d.conversions * 100) / 100 : null,
    spendUsd: Math.round(d.spendUsd * 100) / 100,
  })).sort((a, b) => b.spendUsd - a.spendUsd);
}

function rollupGeo(geoRows) {
  // Map criterion IDs to ISO country codes for common territories
  const COUNTRY_MAP = {
    "2840": "US", "2356": "IN", "2036": "AU", "2826": "GB",
    "2124": "CA", "2276": "DE", "2784": "AE", "2702": "SG",
    "2458": "MY", "2554": "NZ", "2344": "HK",
  };

  const map = new Map();
  for (const r of geoRows) {
    const countryCode = COUNTRY_MAP[r.countryCriterionId] ?? r.countryCriterionId ?? "unknown";
    const key = `${r.campaignId}|${countryCode}`;
    if (!map.has(key)) {
      map.set(key, {
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        countryCriterionId: r.countryCriterionId,
        countryCode,
        impressions: 0, clicks: 0, spendUsd: 0, conversions: 0,
      });
    }
    const g = map.get(key);
    g.impressions += r.impressions;
    g.clicks += r.clicks;
    g.spendUsd += r.spendUsd ?? 0;
    g.conversions += r.conversions;
  }

  return [...map.values()].map(g => ({
    ...g,
    ctrPct: g.impressions > 0 ? Math.round(g.clicks / g.impressions * 10000) / 100 : null,
    avgCpcUsd: g.clicks > 0 ? Math.round(g.spendUsd / g.clicks * 100) / 100 : null,
    costPerConversionUsd: g.conversions > 0 ? Math.round(g.spendUsd / g.conversions * 100) / 100 : null,
    spendUsd: Math.round(g.spendUsd * 100) / 100,
  })).sort((a, b) => b.spendUsd - a.spendUsd);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const {
    GOOGLE_ADS_DEVELOPER_TOKEN: developerToken,
    GOOGLE_ADS_CLIENT_ID: clientId,
    GOOGLE_ADS_CLIENT_SECRET: clientSecret,
    GOOGLE_ADS_REFRESH_TOKEN: refreshToken,
    GOOGLE_ADS_CUSTOMER_ID: customerId,
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: loginCustomerId,
  } = process.env;

  if (!developerToken || !customerId || !refreshToken || !clientId || !clientSecret) {
    console.error("[google-ads-intelligence] Missing required env vars. Check .env.local");
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const { from, to } = dateRange();
  console.log(`[google-ads-intelligence] Date range: ${from} → ${to} (${LOOKBACK_DAYS} days)`);
  console.log(`[google-ads-intelligence] Customer ID: ${customerId}`);

  // Refresh access token
  console.log("\n[google-ads-intelligence] Refreshing OAuth token...");
  let accessToken;
  try {
    accessToken = await getAccessToken();
    console.log("[google-ads-intelligence] Token OK");
  } catch (err) {
    console.error("[google-ads-intelligence] Token refresh failed:", err.message);
    process.exit(1);
  }

  const queryArgs = { accessToken, customerId, loginCustomerId, developerToken };

  // Run all 7 queries
  const errors = [];
  let campaignRows = [], keywordRows = [], searchTermRows = [];
  let adCopyRows = [], geoRows = [], deviceRows = [], conversionRows = [];

  // 1. Campaign + ad group daily metrics
  console.log("\n[1/7] Campaign + ad group daily metrics...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildCampaignQuery(from, to), label: "campaigns" });
    campaignRows = raw.map(normalizeCampaignRow).filter(r => r.campaignId && r.date);
    console.log(`  → ${campaignRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "campaigns", message: err.message });
  }

  // 2. Keyword view
  console.log("\n[2/7] Keyword view...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildKeywordQuery(from, to), label: "keywords" });
    keywordRows = raw.map(normalizeKeywordRow).filter(r => r.keyword);
    console.log(`  → ${keywordRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "keywords", message: err.message });
  }

  // 3. Search term view
  console.log("\n[3/7] Search term view...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildSearchTermQuery(from, to), label: "searchTerms" });
    searchTermRows = raw.map(normalizeSearchTermRow).filter(r => r.searchTerm);
    console.log(`  → ${searchTermRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "searchTerms", message: err.message });
  }

  // 4. Ad copy
  console.log("\n[4/7] Ad copy (ad_group_ad)...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildAdCopyQuery(from, to), label: "adCopy" });
    adCopyRows = raw.map(normalizeAdCopyRow).filter(r => r.adId);
    console.log(`  → ${adCopyRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "adCopy", message: err.message });
  }

  // 5. Geographic view
  console.log("\n[5/7] Geographic view...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildGeoQuery(from, to), label: "geo" });
    geoRows = raw.map(normalizeGeoRow).filter(r => r.campaignId);
    console.log(`  → ${geoRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "geo", message: err.message });
  }

  // 6. Device breakdown
  console.log("\n[6/7] Device breakdown...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildDeviceQuery(from, to), label: "devices" });
    deviceRows = raw.map(normalizeDeviceRow).filter(r => r.device);
    console.log(`  → ${deviceRows.length} normalized rows`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "devices", message: err.message });
  }

  // 7. Conversion actions
  console.log("\n[7/7] Conversion actions...");
  try {
    const raw = await runQuery({ ...queryArgs, query: buildConversionQuery(), label: "conversions" });
    conversionRows = raw.map(normalizeConversionRow).filter(r => r.conversionActionId);
    console.log(`  → ${conversionRows.length} conversion actions`);
  } catch (err) {
    console.error("  ERROR:", err.message);
    errors.push({ query: "conversions", message: err.message });
  }

  // Build rollups
  console.log("\n[google-ads-intelligence] Building rollups...");
  const campaignRollup = rollupByCampaign(campaignRows);
  const keywordRollup = rollupKeywordsByCampaign(keywordRows);
  const searchTermRollup = rollupSearchTerms(searchTermRows);
  const deviceRollup = rollupDevices(deviceRows);
  const geoRollup = rollupGeo(geoRows);

  // Account-level totals
  const totalSpend = campaignRollup.reduce((s, c) => s + c.spendUsd, 0);
  const totalClicks = campaignRollup.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = campaignRollup.reduce((s, c) => s + c.impressions, 0);
  const totalConversions = campaignRollup.reduce((s, c) => s + c.conversions, 0);

  // Build artifact
  const artifact = {
    meta: {
      family: "google-ads-intelligence",
      source: `Google Ads API v25 — Customer ${customerId}`,
      generatedAt,
      lookbackDays: LOOKBACK_DAYS,
      dateRange: { from, to },
      customerId,
      provenance: "live",
      refreshCadence: "daily",
      version: 2,
      caveats: [
        "Conversions = Google Ads attributed conversions using default conversion windows.",
        "All spend figures are in USD converted from micros.",
        "CTR is expressed as a percentage (0-100).",
        "Auction Insights are not available via API — use ingest-google-reports.mjs with manual CSV export.",
        "Geographic data uses Google Ads criterion IDs mapped to ISO country codes where known.",
        "Search terms sampled by Google for low-volume queries — actual query count may be higher.",
        "Device breakdown is at ad group + day level — roll up as needed.",
        "Quality Score is only returned for active keywords with sufficient history.",
      ],
      errors,
    },
    data: {
      accountSummary: {
        totalSpendUsd: Math.round(totalSpend * 100) / 100,
        totalClicks,
        totalImpressions,
        totalConversions: Math.round(totalConversions * 10) / 10,
        overallCtrPct: totalImpressions > 0 ? Math.round(totalClicks / totalImpressions * 10000) / 100 : null,
        overallAvgCpcUsd: totalClicks > 0 ? Math.round(totalSpend / totalClicks * 100) / 100 : null,
        overallCostPerConversionUsd: totalConversions > 0 ? Math.round(totalSpend / totalConversions * 100) / 100 : null,
      },

      // Per-campaign summary rollup
      campaignRollup,

      // Daily rows (for DoD, WoW, MoM time-series)
      campaignDailyRows: campaignRows,

      // Keyword data — rolled up and daily
      keywordRollup,
      keywordDailyRows: keywordRows,

      // Search term data
      searchTermRollup,
      searchTermDailyRows: searchTermRows,

      // Ad copy
      adCopyRows,

      // Device breakdown
      deviceRollup,
      deviceDailyRows: deviceRows,

      // Geographic breakdown
      geoRollup,
      geoDailyRows: geoRows,

      // Conversion actions registry
      conversionActions: conversionRows,
    },
  };

  // Write artifact
  await mkdir(join("data", "artifacts"), { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  // Summary
  console.log("\n[google-ads-intelligence] ✓ Written to", ARTIFACT_PATH);
  console.log("\n=== SUMMARY ===");
  console.log(`  Account spend (${from} → ${to}): $${artifact.data.accountSummary.totalSpendUsd}`);
  console.log(`  Clicks: ${totalClicks.toLocaleString()}`);
  console.log(`  Impressions: ${totalImpressions.toLocaleString()}`);
  console.log(`  Conversions: ${artifact.data.accountSummary.totalConversions}`);
  console.log(`  Campaigns: ${campaignRollup.length}`);
  console.log(`  Keywords: ${keywordRollup.length}`);
  console.log(`  Search terms: ${searchTermRollup.length}`);
  console.log(`  Ads: ${adCopyRows.length}`);
  console.log(`  Geo rows: ${geoRollup.length}`);
  console.log(`  Conversion actions: ${conversionRows.length}`);
  if (errors.length > 0) {
    console.log(`\n  ⚠️  Errors on ${errors.length} queries:`, errors.map(e => e.query).join(", "));
  }

  console.log("\nTop 5 campaigns by spend:");
  for (const c of campaignRollup.slice(0, 5)) {
    console.log(`  ${c.campaignName} — $${c.spendUsd} | ${c.conversions} conv | CTR ${c.ctrPct}%`);
  }

  const wastedKeywords = keywordRollup.filter(k => k.isWastedSpend).slice(0, 5);
  if (wastedKeywords.length > 0) {
    console.log("\nTop wasted-spend keywords (spend but 0 conversions):");
    for (const k of wastedKeywords) {
      console.log(`  "${k.keyword}" [${k.matchType}] — $${k.spendUsd} | $${k.avgCpcUsd} CPC | ${k.ctrPct}% CTR`);
    }
  }
}

await run();
