/**
 * pull-raw-ads-data.mjs
 *
 * Standalone script — runs OUTSIDE the codebase.
 * Pulls raw Meta + Google Ads API responses and saves them to disk.
 *
 * Usage:
 *   node "D:\Infinitra Projects\xpat\pull-raw-ads-data.mjs"
 *
 * Output:
 *   D:\Infinitra Projects\xpat\raw\meta\YYYY-MM-DD\raw.json
 *   D:\Infinitra Projects\xpat\raw\google\YYYY-MM-DD\raw.json
 *
 * Credentials read from D:\Infinitra Projects\xpat\xpat-os\.env.local
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TODAY = new Date().toISOString().slice(0, 10);
const RAW_DIR = "D:\\Infinitra Projects\\xpat\\raw"; // outside codebase
const ENV_FILE = join(__dirname, "..", ".env.local");

// ---------------------------------------------------------------------------
// Parse .env.local
// ---------------------------------------------------------------------------
function parseEnv(filePath) {
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[key] = val;
  }
  return env;
}

function log(msg) { console.log(msg); }

// ---------------------------------------------------------------------------
// Pull raw Meta data
// ---------------------------------------------------------------------------
async function pullMetaRaw(env) {
  log("\n--- Pulling Meta Ads raw data ---");

  const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID } = env;
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    log("✗ META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set in .env.local");
    return null;
  }

  const fields = [
    "campaign_id", "campaign_name", "adset_id", "adset_name",
    "spend", "impressions", "clicks", "reach", "ctr", "cpc", "cpm",
    "objective", "actions", "cost_per_action_type"
  ].join(",");

  const url = `https://graph.facebook.com/v20.0/${META_AD_ACCOUNT_ID}/insights` +
    `?fields=${fields}&date_preset=maximum&level=adset&time_increment=1&limit=500` +
    `&access_token=${encodeURIComponent(META_ACCESS_TOKEN)}`;

  const allRows = [];
  let nextUrl = url;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log(`✗ Meta API HTTP ${response.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const json = await response.json();
    if (json.error) {
      log(`✗ Meta API error: ${json.error.message}`);
      return null;
    }
    allRows.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
    pageCount++;
    log(`  Page ${pageCount}: ${json.data?.length ?? 0} rows (total so far: ${allRows.length})`);
  }

  log(`✓ Meta: ${allRows.length} raw rows pulled`);
  return {
    capturedAt: new Date().toISOString(),
    source: `Meta Marketing API v20.0 — ${META_AD_ACCOUNT_ID}`,
    rowCount: allRows.length,
    rows: allRows,
  };
}

// ---------------------------------------------------------------------------
// Pull raw Google Ads data
// ---------------------------------------------------------------------------
async function getGoogleAccessToken(env) {
  const { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN } = env;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await response.json();
  if (!json.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function pullGoogleRaw(env) {
  log("\n--- Pulling Google Ads raw data ---");

  const { GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_LOGIN_CUSTOMER_ID } = env;
  if (!GOOGLE_ADS_DEVELOPER_TOKEN || !GOOGLE_ADS_CUSTOMER_ID) {
    log("✗ Google Ads credentials not set in .env.local");
    return null;
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken(env);
    log("  ✓ Google OAuth token refreshed");
  } catch (err) {
    log(`✗ Google token refresh failed: ${err.message}`);
    return null;
  }

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const query = `
    SELECT
      campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
      ad_group.id, ad_group.name,
      metrics.impressions, metrics.clicks, metrics.cost_micros,
      metrics.ctr, metrics.average_cpc, metrics.average_cpm,
      metrics.conversions, metrics.cost_per_conversion,
      segments.date
    FROM ad_group
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group.status != 'REMOVED'
      AND metrics.impressions > 0
    ORDER BY segments.date DESC
    LIMIT 10000
  `.trim();

  const cleanCustomerId = GOOGLE_ADS_CUSTOMER_ID.replace(/-/gu, "");
  const url = `https://googleads.googleapis.com/v25/customers/${cleanCustomerId}/googleAds:search`;

  const headers = {
    "authorization": `Bearer ${accessToken}`,
    "content-type": "application/json",
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
  };
  if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/-/gu, "");
  }

  const allRows = [];
  let pageToken = null;
  let pageCount = 0;

  do {
    const body = { query };
    if (pageToken) body.pageToken = pageToken;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      log(`✗ Google Ads API HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      return null;
    }

    const json = await response.json();
    if (json.error) {
      log(`✗ Google Ads API error: ${json.error.message}`);
      return null;
    }

    allRows.push(...(json.results ?? []));
    pageToken = json.nextPageToken ?? null;
    pageCount++;
    log(`  Page ${pageCount}: ${json.results?.length ?? 0} rows (total so far: ${allRows.length})`);
  } while (pageToken && pageCount < 50);

  log(`✓ Google: ${allRows.length} raw rows pulled`);
  return {
    capturedAt: new Date().toISOString(),
    source: `Google Ads API v25 — Customer ${GOOGLE_ADS_CUSTOMER_ID}`,
    rowCount: allRows.length,
    rows: allRows,
  };
}

// ---------------------------------------------------------------------------
// Save to disk
// ---------------------------------------------------------------------------
function saveRaw(platform, data) {
  const dir = join(RAW_DIR, platform, TODAY);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, "raw.json");
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  const sizeMB = (Buffer.byteLength(JSON.stringify(data)) / 1024 / 1024).toFixed(2);
  log(`  Saved: ${filePath} (${sizeMB} MB)`);
  return filePath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  log("=== XPAT Raw Ads Data Puller ===");
  log(`Date: ${TODAY}`);
  log(`Output: ${RAW_DIR}\n`);

  // Load credentials
  let env;
  try {
    env = parseEnv(ENV_FILE);
    log(`✓ Loaded credentials from ${ENV_FILE}`);
  } catch (err) {
    log(`✗ Could not read .env.local: ${err.message}`);
    process.exit(1);
  }

  // Pull Meta
  const metaData = await pullMetaRaw(env);
  if (metaData) {
    saveRaw("meta", metaData);
  }

  // Pull Google
  const googleData = await pullGoogleRaw(env);
  if (googleData) {
    saveRaw("google", googleData);
  }

  log("\n=== Done ===");
  log(`Raw files saved to: ${RAW_DIR}`);
  if (metaData)   log(`  meta/${TODAY}/raw.json   → ${metaData.rowCount} rows`);
  if (googleData) log(`  google/${TODAY}/raw.json → ${googleData.rowCount} rows`);
}

main().catch(err => {
  console.error("✗ Fatal error:", err.message);
  process.exit(1);
});
