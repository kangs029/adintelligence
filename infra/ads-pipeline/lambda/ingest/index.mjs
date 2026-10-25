/**
 * Lambda: xpat-ads-ingest
 *
 * Pulls data from Google Ads API and stores in S3, organized by folder:
 *   - /campaigns/{date}/data.json
 *   - /adgroups/{date}/data.json
 *   - /keywords/{date}/data.json
 *   - /search-terms/{date}/data.json
 *   - /ads/{date}/data.json
 *   - /geo/{date}/data.json
 *   - /devices/{date}/data.json
 *
 * Supports incremental pulls — reads last pull date from S3 marker file.
 *
 * Triggered by: EventBridge (daily at 6 AM UTC)
 * 
 * Environment variables:
 *   - RAW_BUCKET_NAME: S3 bucket name
 *   - SECRETS_ARN: ARN of Secrets Manager secret with Google Ads credentials
 *   - ENVIRONMENT: dev or prod
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const s3 = new S3Client({});
const secretsManager = new SecretsManagerClient({});

const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const DEFAULT_LOOKBACK_DAYS = 7; // For incremental, pull last 7 days by default
const FULL_LOOKBACK_DAYS = 90;   // For full refresh

// ---------------------------------------------------------------------------
// Secrets Manager — Get Google Ads credentials
// ---------------------------------------------------------------------------

let cachedSecrets = null;

async function getSecrets() {
  if (cachedSecrets) return cachedSecrets;

  const secretArn = process.env.SECRETS_ARN;
  if (!secretArn) throw new Error("SECRETS_ARN environment variable not set");

  console.log("[secrets] Fetching from Secrets Manager...");
  const response = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  cachedSecrets = JSON.parse(response.SecretString);
  console.log("[secrets] Credentials loaded");
  return cachedSecrets;
}

// ---------------------------------------------------------------------------
// OAuth token refresh
// ---------------------------------------------------------------------------

async function getAccessToken(secrets) {
  console.log("[oauth] Refreshing access token...");
  
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: secrets.GOOGLE_ADS_CLIENT_ID,
      client_secret: secrets.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: secrets.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Token refresh HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Token refresh did not return access_token");
  
  console.log("[oauth] Access token obtained");
  return json.access_token;
}

// ---------------------------------------------------------------------------
// Incremental date tracking
// ---------------------------------------------------------------------------

async function getLastPullDate(bucketName) {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: "_meta/last-pull-date.json",
      })
    );
    const body = await response.Body.transformToString();
    const data = JSON.parse(body);
    console.log(`[incremental] Last pull date: ${data.lastPullDate}`);
    return data.lastPullDate;
  } catch (err) {
    if (err.name === "NoSuchKey") {
      console.log("[incremental] No previous pull found, will do full refresh");
      return null;
    }
    throw err;
  }
}

async function saveLastPullDate(bucketName, date) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: "_meta/last-pull-date.json",
      Body: JSON.stringify({ lastPullDate: date, updatedAt: new Date().toISOString() }),
      ContentType: "application/json",
    })
  );
  console.log(`[incremental] Saved last pull date: ${date}`);
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
// S3 upload helper
// ---------------------------------------------------------------------------

async function uploadToS3(bucketName, folder, date, data) {
  const key = `${folder}/${date}/data.json`;
  
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
  
  console.log(`  → Uploaded s3://${bucketName}/${key} (${data.rows?.length ?? 0} rows)`);
  return key;
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
  return Number.isFinite(n) ? Math.round(n * 10000) / 100 : null;
}

function str(v) {
  return v != null ? String(v).trim() : null;
}

// ---------------------------------------------------------------------------
// Query builders and normalizers for each data type
// ---------------------------------------------------------------------------

// 1. Campaigns (with ad groups)
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

// 2. Keywords
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

// 3. Search Terms
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

// 4. Ad Copy
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

  const headlines = (rsa.headlines ?? []).map(h => h.text).filter(Boolean);
  const descriptions = (rsa.descriptions ?? []).map(d => d.text).filter(Boolean);

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
    headline1: eta.headlinePart1 || headlines[0] || null,
    headline2: eta.headlinePart2 || headlines[1] || null,
    headline3: eta.headlinePart3 || headlines[2] || null,
    allHeadlines: headlines.length > 0 ? headlines : null,
    description1: eta.description || descriptions[0] || null,
    description2: eta.description2 || descriptions[1] || null,
    allDescriptions: descriptions.length > 0 ? descriptions : null,
    impressions: num(row.metrics?.impressions),
    clicks: num(row.metrics?.clicks),
    spendUsd: micros(row.metrics?.costMicros),
    ctrPct: pct(row.metrics?.ctr),
    conversions: num(row.metrics?.conversions),
    costPerConversionUsd: micros(row.metrics?.costPerConversion),
  };
}

// 5. Geographic
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

// 6. Devices
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

// 7. Conversion Actions (no date filter needed)
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
  };
}

// ---------------------------------------------------------------------------
// Main Lambda handler
// ---------------------------------------------------------------------------

export async function handler(event, context) {
  console.log("[ingest] Starting Google Ads data ingestion");
  console.log("[ingest] Event:", JSON.stringify(event, null, 2));

  const bucketName = process.env.RAW_BUCKET_NAME;
  const environment = process.env.ENVIRONMENT || "dev";

  if (!bucketName) {
    throw new Error("RAW_BUCKET_NAME environment variable not set");
  }

  // Get credentials from Secrets Manager
  const secrets = await getSecrets();
  
  // Get OAuth access token
  const accessToken = await getAccessToken(secrets);

  const customerId = secrets.GOOGLE_ADS_CUSTOMER_ID;
  const loginCustomerId = secrets.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const developerToken = secrets.GOOGLE_ADS_DEVELOPER_TOKEN;

  // Determine date range (incremental vs full)
  const lastPullDate = await getLastPullDate(bucketName);
  const today = new Date().toISOString().slice(0, 10);
  
  let fromDate;
  if (lastPullDate) {
    // Incremental: pull from last pull date (with 1 day overlap for safety)
    const lastPull = new Date(lastPullDate);
    lastPull.setDate(lastPull.getDate() - 1);
    fromDate = lastPull.toISOString().slice(0, 10);
    console.log(`[ingest] Incremental pull: ${fromDate} → ${today}`);
  } else {
    // Full refresh: pull last 90 days
    const from = new Date();
    from.setDate(from.getDate() - FULL_LOOKBACK_DAYS);
    fromDate = from.toISOString().slice(0, 10);
    console.log(`[ingest] Full refresh: ${fromDate} → ${today} (${FULL_LOOKBACK_DAYS} days)`);
  }

  const queryArgs = { accessToken, customerId, loginCustomerId, developerToken };
  const results = { success: [], errors: [] };

  // Define all data types to pull
  const dataSources = [
    {
      folder: "campaigns",
      label: "campaigns",
      query: buildCampaignQuery(fromDate, today),
      normalize: normalizeCampaignRow,
      filter: r => r.campaignId && r.date,
    },
    {
      folder: "keywords",
      label: "keywords",
      query: buildKeywordQuery(fromDate, today),
      normalize: normalizeKeywordRow,
      filter: r => r.keyword,
    },
    {
      folder: "search-terms",
      label: "search-terms",
      query: buildSearchTermQuery(fromDate, today),
      normalize: normalizeSearchTermRow,
      filter: r => r.searchTerm,
    },
    {
      folder: "ads",
      label: "ads",
      query: buildAdCopyQuery(fromDate, today),
      normalize: normalizeAdCopyRow,
      filter: r => r.adId,
    },
    {
      folder: "geo",
      label: "geo",
      query: buildGeoQuery(fromDate, today),
      normalize: normalizeGeoRow,
      filter: r => r.campaignId,
    },
    {
      folder: "devices",
      label: "devices",
      query: buildDeviceQuery(fromDate, today),
      normalize: normalizeDeviceRow,
      filter: r => r.device,
    },
  ];

  // Pull each data source
  for (const source of dataSources) {
    console.log(`\n[${source.label}] Pulling data...`);
    try {
      const rawRows = await runQuery({ ...queryArgs, query: source.query, label: source.label });
      const rows = rawRows.map(source.normalize).filter(source.filter);
      
      const data = {
        meta: {
          source: `Google Ads API v25`,
          customerId,
          dateRange: { from: fromDate, to: today },
          pulledAt: new Date().toISOString(),
          rowCount: rows.length,
        },
        rows,
      };

      await uploadToS3(bucketName, source.folder, today, data);
      results.success.push({ folder: source.folder, rows: rows.length });
    } catch (err) {
      console.error(`[${source.label}] ERROR:`, err.message);
      results.errors.push({ folder: source.folder, error: err.message });
    }
  }

  // Pull conversion actions separately (no date filter)
  console.log("\n[conversions] Pulling conversion actions...");
  try {
    const rawRows = await runQuery({ ...queryArgs, query: buildConversionQuery(), label: "conversions" });
    const rows = rawRows.map(normalizeConversionRow).filter(r => r.conversionActionId);
    
    const data = {
      meta: {
        source: `Google Ads API v25`,
        customerId,
        pulledAt: new Date().toISOString(),
        rowCount: rows.length,
      },
      rows,
    };

    // Conversion actions don't change daily, store in a fixed location
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "conversions/latest/data.json",
        Body: JSON.stringify(data, null, 2),
        ContentType: "application/json",
      })
    );
    console.log(`  → Uploaded s3://${bucketName}/conversions/latest/data.json (${rows.length} rows)`);
    results.success.push({ folder: "conversions", rows: rows.length });
  } catch (err) {
    console.error("[conversions] ERROR:", err.message);
    results.errors.push({ folder: "conversions", error: err.message });
  }

  // Save last pull date marker
  await saveLastPullDate(bucketName, today);

  // Summary
  console.log("\n=== INGESTION COMPLETE ===");
  console.log(`Success: ${results.success.length} sources`);
  console.log(`Errors: ${results.errors.length} sources`);
  
  for (const s of results.success) {
    console.log(`  ✓ ${s.folder}: ${s.rows} rows`);
  }
  for (const e of results.errors) {
    console.log(`  ✗ ${e.folder}: ${e.error}`);
  }

  return {
    statusCode: results.errors.length > 0 ? 207 : 200,
    body: JSON.stringify({
      message: "Ingestion complete",
      date: today,
      dateRange: { from: fromDate, to: today },
      results,
    }),
  };
}
