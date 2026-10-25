/**
 * End-to-end test: simulates exactly what the agent does when
 * "Which campaigns drove the most actual signups?" is asked.
 *
 * Run: node --env-file=.env.local scripts/test-attribution-e2e.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const METABASE_URL = process.env.METABASE_URL;
const METABASE_API_KEY = process.env.METABASE_API_KEY;

console.log("=== Step 1: env vars ===");
console.log("METABASE_URL:", METABASE_URL ? "SET" : "MISSING");
console.log("METABASE_API_KEY:", METABASE_API_KEY ? "SET" : "MISSING");
if (!METABASE_URL || !METABASE_API_KEY) {
  console.error("ABORT: env vars missing");
  process.exit(1);
}

console.log("\n=== Step 2: utm-campaigns.json artifact ===");
const artifactPath = join(process.cwd(), "data", "artifacts", "utm-campaigns.json");
if (!existsSync(artifactPath)) {
  console.error("ABORT: utm-campaigns.json not found at", artifactPath);
  process.exit(1);
}
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
console.log("Artifact loaded — campaigns:", artifact.data.campaigns.length);
console.log("Top 3:", artifact.data.campaigns.slice(0, 3).map(c => `${c.utm_campaign} (${c.user_count})`));

console.log("\n=== Step 3: Metabase SQL query ===");
const sql = `
  SELECT
    ad.utm_campaign,
    ad.utm_source,
    ad.utm_medium,
    COUNT(DISTINCT ad.user_id) AS total_signups,
    COUNT(DISTINCT CASE WHEN up.is_signup_workflow_completed = 1 THEN ad.user_id END) AS signup_workflow_completed,
    MIN(DATE(ad.acquisition_timestamp)) AS first_seen,
    MAX(DATE(ad.acquisition_timestamp)) AS last_seen
  FROM v_acquisition_data_clean ad
  LEFT JOIN v_userprofile_clean up ON ad.user_id = up.user_id
  WHERE ad.utm_campaign IS NOT NULL
  GROUP BY ad.utm_campaign, ad.utm_source, ad.utm_medium
  ORDER BY total_signups DESC
  LIMIT 10
`.trim();

let response;
try {
  response = await fetch(`${METABASE_URL}/api/dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": METABASE_API_KEY,
    },
    body: JSON.stringify({
      database: 2,
      type: "native",
      native: { query: sql },
    }),
  });
} catch (err) {
  console.error("FETCH ERROR:", err.message);
  process.exit(1);
}

console.log("HTTP status:", response.status);

if (!response.ok) {
  const body = await response.text();
  console.error("HTTP ERROR body:", body.slice(0, 500));
  process.exit(1);
}

const json = await response.json();

if (json.error) {
  console.error("METABASE QUERY ERROR:", json.error);
  process.exit(1);
}

const cols = (json.data?.cols ?? []).map(c => c.name);
const rows = (json.data?.rows ?? []).map(row => {
  const obj = {};
  cols.forEach((c, i) => { obj[c] = row[i]; });
  return obj;
});

console.log("Columns:", cols);
console.log("Rows returned:", rows.length);
console.log("Top 5 campaigns by signups:");
rows.slice(0, 5).forEach(r => {
  console.log(`  ${r.utm_campaign} (${r.utm_source}) — ${r.total_signups} signups, ${r.signup_workflow_completed} completed`);
});

console.log("\n=== ALL STEPS PASSED ===");
console.log("The agent should be able to answer attribution questions.");
