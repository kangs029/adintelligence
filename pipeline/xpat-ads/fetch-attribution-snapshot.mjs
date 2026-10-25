/**
 * Fetches a daily attribution snapshot from XPAT's Metabase prod read database.
 *
 * Runs three queries and combines them into a single artifact:
 *   1. Signups + onboarding completion per campaign (last 90 days + all-time)
 *   2. KYC funnel per campaign (last 90 days)
 *   3. Transactions per campaign (last 90 days)
 *
 * The artifact is read by the Ad Analyst agent's getAttributionSnapshot tool
 * so it can answer most attribution questions without a live Metabase call.
 *
 * Usage:
 *   node --env-file=.env.local pipeline/xpat-ads/fetch-attribution-snapshot.mjs
 *
 * Requires:
 *   METABASE_URL     — e.g. https://metabase-internal.xpat.money
 *   METABASE_API_KEY — X-API-Key for Metabase
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const METABASE_DATABASE_ID = 2;
const ARTIFACT_PATH = join("data", "artifacts", "attribution-snapshot.json");

// ---------------------------------------------------------------------------
// Metabase query runner
// ---------------------------------------------------------------------------

async function runQuery(sql) {
  const baseUrl = process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;

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
    throw new Error(`Metabase HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const json = await response.json();
  if (json.error) throw new Error(`Metabase query error: ${json.error}`);

  const cols = (json.data?.cols ?? []).map((c) => c.name);
  const rows = (json.data?.rows ?? []).map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i] ?? null; });
    return obj;
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Query 1 — Signups per campaign
// ---------------------------------------------------------------------------

async function fetchSignups(windowDays) {
  const sql = `
    SELECT
      ad.utm_campaign,
      ad.utm_source,
      ad.utm_medium,
      COUNT(DISTINCT ad.user_id)                                            AS total_signups,
      COUNT(DISTINCT CASE WHEN up.is_signup_workflow_completed = 1
            THEN ad.user_id END)                                            AS onboarding_completed,
      COUNT(DISTINCT CASE WHEN up.account_status = 'ACTIVE'
            THEN ad.user_id END)                                            AS active_accounts,
      MIN(DATE(ad.acquisition_timestamp))                                   AS first_seen,
      MAX(DATE(ad.acquisition_timestamp))                                   AS last_seen
    FROM v_acquisition_data_clean ad
    LEFT JOIN v_userprofile_clean up ON ad.user_id = up.user_id
    WHERE ad.utm_campaign IS NOT NULL
      AND ad.utm_campaign != ''
      AND ad.utm_campaign != '{campaignname}'
      AND ad.acquisition_timestamp >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
    GROUP BY ad.utm_campaign, ad.utm_source, ad.utm_medium
    ORDER BY total_signups DESC
    LIMIT 200
  `.trim();

  return runQuery(sql);
}

// ---------------------------------------------------------------------------
// Query 2 — KYC funnel per campaign
// ---------------------------------------------------------------------------

async function fetchKyc(windowDays) {
  const sql = `
    SELECT
      ad.utm_campaign,
      ad.utm_source,
      COUNT(DISTINCT ad.user_id)                                            AS total_signups,
      COUNT(DISTINCT kyc.user_id)                                           AS kyc_attempted,
      ROUND(
        COUNT(DISTINCT kyc.user_id) * 100.0 / NULLIF(COUNT(DISTINCT ad.user_id), 0),
        1
      )                                                                     AS kyc_attempt_rate_pct
    FROM v_acquisition_data_clean ad
    LEFT JOIN v_userkycdetails_clean kyc ON ad.user_id = kyc.user_id
    WHERE ad.utm_campaign IS NOT NULL
      AND ad.utm_campaign != ''
      AND ad.utm_campaign != '{campaignname}'
      AND ad.acquisition_timestamp >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
    GROUP BY ad.utm_campaign, ad.utm_source
    ORDER BY total_signups DESC
    LIMIT 200
  `.trim();

  return runQuery(sql);
}

// ---------------------------------------------------------------------------
// Query 3 — Transactions per campaign
// ---------------------------------------------------------------------------

async function fetchTransactions(windowDays) {
  const sql = `
    SELECT
      ad.utm_campaign,
      ad.utm_source,
      COUNT(DISTINCT ad.user_id)                                            AS users_acquired,
      COUNT(DISTINCT t.user_id)                                             AS users_transacted,
      COUNT(t.user_id)                                                      AS total_transactions,
      ROUND(
        COUNT(DISTINCT t.user_id) * 100.0 / NULLIF(COUNT(DISTINCT ad.user_id), 0),
        1
      )                                                                     AS transaction_rate_pct
    FROM v_acquisition_data_clean ad
    LEFT JOIN transaction t ON ad.user_id = t.user_id
    WHERE ad.utm_campaign IS NOT NULL
      AND ad.utm_campaign != ''
      AND ad.utm_campaign != '{campaignname}'
      AND ad.acquisition_timestamp >= DATE_SUB(NOW(), INTERVAL ${windowDays} DAY)
    GROUP BY ad.utm_campaign, ad.utm_source
    ORDER BY users_transacted DESC
    LIMIT 200
  `.trim();

  return runQuery(sql);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  const baseUrl = process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;

  if (!baseUrl || !apiKey) {
    console.error("[attribution-snapshot] METABASE_URL and METABASE_API_KEY must be set.");
    process.exit(1);
  }

  const generatedAt = new Date().toISOString();
  const WINDOW_DAYS = 90;

  console.log(`[attribution-snapshot] Fetching last ${WINDOW_DAYS} days from Metabase...`);

  let signups, kyc, transactions;

  try {
    console.log("[attribution-snapshot] 1/3 signups...");
    signups = await fetchSignups(WINDOW_DAYS);
    console.log(`[attribution-snapshot]     → ${signups.length} campaign rows`);

    console.log("[attribution-snapshot] 2/3 KYC funnel...");
    kyc = await fetchKyc(WINDOW_DAYS);
    console.log(`[attribution-snapshot]     → ${kyc.length} campaign rows`);

    console.log("[attribution-snapshot] 3/3 transactions...");
    transactions = await fetchTransactions(WINDOW_DAYS);
    console.log(`[attribution-snapshot]     → ${transactions.length} campaign rows`);
  } catch (err) {
    console.error("[attribution-snapshot] Failed:", err.message);
    process.exit(1);
  }

  // Merge all three into a single per-campaign record keyed by utm_campaign+utm_source
  const merged = new Map();

  for (const row of signups) {
    const key = `${row.utm_campaign}|${row.utm_source}`;
    merged.set(key, {
      utm_campaign: row.utm_campaign,
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      total_signups: row.total_signups,
      onboarding_completed: row.onboarding_completed,
      active_accounts: row.active_accounts,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      // KYC and transaction fields default to null until merged
      kyc_attempted: null,
      kyc_attempt_rate_pct: null,
      users_transacted: null,
      total_transactions: null,
      transaction_rate_pct: null,
    });
  }

  for (const row of kyc) {
    const key = `${row.utm_campaign}|${row.utm_source}`;
    const existing = merged.get(key);
    if (existing) {
      existing.kyc_attempted = row.kyc_attempted;
      existing.kyc_attempt_rate_pct = row.kyc_attempt_rate_pct;
    }
  }

  for (const row of transactions) {
    const key = `${row.utm_campaign}|${row.utm_source}`;
    const existing = merged.get(key);
    if (existing) {
      existing.users_transacted = row.users_transacted;
      existing.total_transactions = row.total_transactions;
      existing.transaction_rate_pct = row.transaction_rate_pct;
    }
  }

  const campaigns = [...merged.values()].sort(
    (a, b) => (b.total_signups ?? 0) - (a.total_signups ?? 0),
  );

  const artifact = {
    meta: {
      family: "attribution-snapshot",
      source: "Metabase prod read database — v_acquisition_data_clean, v_userprofile_clean, v_userkycdetails_clean, transaction",
      generatedAt,
      windowDays: WINDOW_DAYS,
      refreshCadence: "daily manual run",
      provenance: "snapshot",
      version: 1,
      caveats: [
        `Data covers the last ${WINDOW_DAYS} days from ${generatedAt.slice(0, 10)}.`,
        "utm_campaign values may not exactly match campaign names shown in Meta or Google Ads dashboards.",
        "KYC and transaction data reflects current status, not status at time of signup.",
        "transaction_rate_pct = percentage of acquired users who made at least one money transfer.",
        "Rows with utm_campaign = '{campaignname}' are excluded — broken UTM template in Google Ads.",
      ],
    },
    data: {
      totalCampaigns: campaigns.length,
      windowDays: WINDOW_DAYS,
      campaigns,
    },
  };

  await mkdir(join("data", "artifacts"), { recursive: true });
  await writeFile(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(`[attribution-snapshot] ✓ Written to ${ARTIFACT_PATH}`);
  console.log(`[attribution-snapshot] ${campaigns.length} campaigns, top 5:`);
  for (const c of campaigns.slice(0, 5)) {
    console.log(
      `  ${c.utm_campaign} (${c.utm_source}) — ${c.total_signups} signups, ${c.users_transacted ?? 0} transacted`,
    );
  }
}

await run();
