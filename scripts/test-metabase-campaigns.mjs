// Run with: node --env-file=.env.local scripts/test-metabase-campaigns.mjs

const res = await fetch(process.env.METABASE_URL + "/api/dataset", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": process.env.METABASE_API_KEY,
  },
  body: JSON.stringify({
    database: 2,
    type: "native",
    native: {
      query: `
        SELECT
          utm_campaign,
          utm_source,
          utm_medium,
          COUNT(DISTINCT user_id) AS user_count,
          MIN(DATE(acquisition_timestamp)) AS first_seen,
          MAX(DATE(acquisition_timestamp)) AS last_seen
        FROM v_acquisition_data_clean
        WHERE utm_campaign IS NOT NULL AND utm_campaign != ''
        GROUP BY utm_campaign, utm_source, utm_medium
        ORDER BY user_count DESC
        LIMIT 150
      `,
    },
  }),
});

const json = await res.json();
const cols = json.data?.cols?.map((c) => c.name) ?? [];
const rows = (json.data?.rows ?? []).map((row) => {
  const obj = {};
  cols.forEach((c, i) => { obj[c] = row[i]; });
  return obj;
});

console.log("HTTP:", res.status);
console.log("Distinct utm_campaign values (top 150 by user count):", rows.length);
console.log("Sample top 20:\n", JSON.stringify(rows.slice(0, 20), null, 2));
