/**
 * Fetches all distinct utm_campaign values from XPAT's Metabase prod read
 * database and writes a compact lookup artifact to data/artifacts/utm-campaigns.json.
 *
 * The artifact is used by the Ad Analyst agent's getCampaignList tool so the
 * agent can look up the exact utm_campaign value before running an attribution
 * query — avoiding "no results found" errors from name mismatches.
 *
 * Usage:
 *   node --env-file=.env.local pipeline/xpat-ads/fetch-utm-campaigns.mjs
 *
 * Requires:
 *   METABASE_URL  — e.g. https://metabase-internal.xpat.money
 *   METABASE_API_KEY — X-API-Key for Metabase
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const METABASE_DATABASE_ID = 2; // prod read database
const ARTIFACT_PATH = join("data", "artifacts", "utm-campaigns.json");

async function fetchAllCampaigns() {
  const baseUrl = process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("METABASE_URL and METABASE_API_KEY must be set in environment.");
  }

  const sql = `
    SELECT
      utm_campaign,
      utm_source,
      utm_medium,
      COUNT(DISTINCT user_id)              AS user_count,
      MIN(DATE(acquisition_timestamp))     AS first_seen,
      MAX(DATE(acquisition_timestamp))     AS last_seen
    FROM v_acquisition_data_clean
    WHERE utm_campaign IS NOT NULL
      AND utm_campaign != ''
      AND utm_campaign != '{campaignname}'
    GROUP BY utm_campaign, utm_source, utm_medium
    ORDER BY user_count DESC
  `.trim();

  console.log("[fetch-utm-campaigns] Querying Metabase for distinct utm_campaign values...");

  const response = await fetch(`${baseUrl}/api/dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      database: METABASE_DATABASE_ID,
      type: "native",
      native: { query: sql },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Metabase returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(`Metabase query error: ${json.error}`);
  }

  const cols = (json.data?.cols ?? []).map((c) => c.name);
  const rows = (json.data?.rows ?? []).map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i] ?? null; });
    return obj;
  });

  return rows;
}

async function run() {
  const generatedAt = new Date().toISOString();

  let campaigns;
  try {
    campaigns = await fetchAllCampaigns();
  } catch (err) {
    console.error("[fetch-utm-campaigns] Failed:", err.message);
    process.exit(1);
  }

  console.log(`[fetch-utm-campaigns] Fetched ${campaigns.length} distinct utm_campaign values.`);

  // Build the artifact
  const artifact = {
    meta: {
      family: "utm-campaigns",
      source: "Metabase prod read database — v_acquisition_data_clean",
      generatedAt,
      refreshCadence: "daily manual run",
      provenance: "snapshot",
      version: 1,
      caveats: [
        "utm_campaign values are set by the marketing team in UTM links and may not match campaign names in Meta or Google Ads.",
        "Rows with utm_campaign = '{campaignname}' are excluded — these indicate a broken UTM template in Google Ads.",
        "user_count is the number of distinct users acquired via each campaign+source+medium combination.",
      ],
    },
    data: {
      totalCampaigns: campaigns.length,
      campaigns,
    },
  };

  // Ensure artifact dir exists
  await mkdir(join("data", "artifacts"), { recursive: true });

  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  await writeFile(ARTIFACT_PATH, json, "utf8");

  console.log(`[fetch-utm-campaigns] Artifact written to ${ARTIFACT_PATH}`);
  console.log(`[fetch-utm-campaigns] Top 5 campaigns by user count:`);
  for (const c of campaigns.slice(0, 5)) {
    console.log(`  ${c.utm_campaign} (${c.utm_source} / ${c.utm_medium}) — ${c.user_count} users`);
  }
}

await run();
