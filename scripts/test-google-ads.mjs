import { loadPipelineEnv } from '../pipeline/lib/env.mjs';
await loadPipelineEnv();

const t = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  })
}).then(r => r.json());

console.log('Token:', t.access_token ? 'OK' : 'FAILED ' + JSON.stringify(t));
if (!t.access_token) process.exit(1);

const query = `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, segments.date FROM ad_group WHERE segments.date BETWEEN '2025-08-13' AND '2026-08-13' AND metrics.impressions > 0 LIMIT 5`;

const r = await fetch('https://googleads.googleapis.com/v25/customers/2329750396/googleAds:search', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + t.access_token,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'content-type': 'application/json'
  },
  body: JSON.stringify({ query })
});
const json = await r.json();
console.log('HTTP:', r.status);
console.log('Results count:', json?.results?.length ?? 0);
if (json?.error) console.log('Error:', JSON.stringify(json.error, null, 2));
if (json?.results?.[0]) console.log('Sample record:', JSON.stringify(json.results[0], null, 2));
else console.log('No results with impressions > 0 in last 365 days');
