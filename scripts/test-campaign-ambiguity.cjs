const artifact = JSON.parse(require('fs').readFileSync('data/artifacts/utm-campaigns.json','utf8'));
const campaigns = artifact.data.campaigns;

for (const keyword of ['search', 'brand', 'generic', 'kyc']) {
  const matches = campaigns.filter(c =>
    c.utm_campaign?.toLowerCase().includes(keyword) ||
    c.utm_source?.toLowerCase().includes(keyword) ||
    c.utm_medium?.toLowerCase().includes(keyword)
  );
  console.log(`\nKeyword "${keyword}": ${matches.length} matches`);
  matches.slice(0, 5).forEach(c =>
    console.log(`  ${c.utm_campaign} (${c.utm_source}/${c.utm_medium}) — ${c.user_count} users`)
  );
}
