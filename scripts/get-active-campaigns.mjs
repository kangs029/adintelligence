import { loadPipelineEnv } from '../pipeline/lib/env.mjs';
import { writeDeterministicJsonPreservingArrays } from '../pipeline/lib/provenance.mjs';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

await loadPipelineEnv();

const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
const LOGIN_CUSTOMER_ID = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/-/g, '');

if (!REFRESH_TOKEN || !CLIENT_ID || !CLIENT_SECRET || !DEVELOPER_TOKEN || !CUSTOMER_ID) {
  console.error('[active-campaigns] Missing required environment variables.');
  console.error('Required: GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID');
  process.exit(1);
}

const ARTIFACT_PATH = join('data', 'artifacts', 'active-campaigns.json');

// Get access token
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token' })
});
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
  console.error('[active-campaigns] Token failed:', JSON.stringify(tokenData));
  process.exit(1);
}
console.log('[active-campaigns] Token OK');

// Query all campaigns with status
const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED') ORDER BY campaign.status, campaign.name LIMIT 100`;

const res = await fetch(`https://googleads.googleapis.com/v25/customers/${CUSTOMER_ID}/googleAds:search`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${tokenData.access_token}`,
    'content-type': 'application/json',
    'developer-token': DEVELOPER_TOKEN,
    'login-customer-id': LOGIN_CUSTOMER_ID,
  },
  body: JSON.stringify({ query })
});

const data = await res.json();
if (data.error) {
  console.error('[active-campaigns] API error:', JSON.stringify(data.error, null, 2));
  process.exit(1);
}

const results = data.results || [];
const enabled = results.filter(r => r.campaign.status === 'ENABLED');
const paused = results.filter(r => r.campaign.status === 'PAUSED');

console.log(`\n[active-campaigns] Found ${results.length} campaigns (${enabled.length} enabled, ${paused.length} paused)`);
enabled.forEach(r => console.log(`  ENABLED | ${r.campaign.id} | ${r.campaign.name}`));

// Build artifact
const artifact = {
  meta: {
    family: 'active-campaigns',
    source: 'Google Ads API — campaign status live fetch',
    generatedAt: new Date().toISOString(),
    refreshCadence: 'manual run — run scripts/get-active-campaigns.mjs when campaigns change',
    provenance: 'snapshot',
    version: 1,
    caveats: [
      'Active campaign IDs are fetched live from Google Ads at time of script run.',
      'Re-run this script when campaigns are enabled, paused, or removed.',
      'Future: replace with scheduled cron job for automatic refresh.',
    ],
  },
  data: {
    enabledCampaignIds: enabled.map(r => r.campaign.id),
    enabledCampaigns: enabled.map(r => ({
      id: r.campaign.id,
      name: r.campaign.name,
      channelType: r.campaign.advertisingChannelType,
      status: r.campaign.status,
    })),
    pausedCampaigns: paused.map(r => ({
      id: r.campaign.id,
      name: r.campaign.name,
      channelType: r.campaign.advertisingChannelType,
      status: r.campaign.status,
    })),
    totalEnabled: enabled.length,
    totalPaused: paused.length,
  },
};

await writeDeterministicJsonPreservingArrays(ARTIFACT_PATH, artifact);
console.log(`\n[active-campaigns] ✓ Written to ${ARTIFACT_PATH}`);
console.log(`[active-campaigns] ${enabled.length} active campaign IDs: ${artifact.data.enabledCampaignIds.join(', ')}`);

// Also update .env.local with new refresh token
const envPath = '.env.local';
const envContent = readFileSync(envPath, 'utf8');
const updated = envContent.replace(
  /GOOGLE_ADS_REFRESH_TOKEN=.*/,
  `GOOGLE_ADS_REFRESH_TOKEN=${REFRESH_TOKEN}`
);
writeFileSync(envPath, updated);
console.log('[active-campaigns] .env.local updated with new refresh token');
