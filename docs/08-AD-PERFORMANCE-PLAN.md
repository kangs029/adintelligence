# Ad Performance Intelligence — Design & Implementation Plan

**Project:** XPAT Intelligence Platform — Module B
**Prepared by:** Infinitra Innovations
**Date:** August 2026
**Status:** Ready to build — credentials verified ✅

---

## Overview

Build an Ad Performance Intelligence layer on top of the existing `xpat-os` codebase. The goal is to allow XPAT's marketing team to ask natural-language questions about their own Meta and Google Ads campaign data and get cited, grounded answers.

**Core user experience:**
> "What's our CPA in Dallas this week?" → AI analyst answers with real data from XPAT's ad accounts

---

## What Already Exists (Do Not Rebuild)

| Component | Location | Reuse |
|---|---|---|
| Evidence chat UI pattern | `components/shell/EvidenceChat.tsx` | Copy the UI pattern, new data source |
| Evidence agent pattern | `lib/ai/evidence-agent.ts` | Copy the agent pattern, new tools |
| Evidence tools pattern | `lib/ai/evidence-tools.ts` | Copy the tool pattern, new artifact |
| Pipeline provenance | `pipeline/lib/provenance.mjs` | Use as-is |
| Pipeline env loader | `pipeline/lib/env.mjs` | Use as-is |
| Pipeline run orchestrator | `pipeline/run.mjs` | Add new family |
| API route pattern | `app/api/evidence/route.ts` | Copy the route pattern |
| Ads import schema | `lib/playbook/ads-import.ts` | Reference the schema types |
| Playbook page | `app/playbook/page.tsx` | Add Ad Analyst chat to this page |

---

## Credentials Available

All credentials are verified and ready in `.env.local`:

```
# Meta Ads API
META_APP_ID=920237800511621
META_APP_SECRET=d2f8d87620aa27ade202c647c817719d
META_ACCESS_TOKEN=EAANE8481WIUBSOUzuo1...  (valid, never expires)
META_AD_ACCOUNT_ID=act_759029483952879

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=fxKOSpq23bjsWFE2-GNW_g
GOOGLE_ADS_CLIENT_ID=190067194515-fvhru5...
GOOGLE_ADS_CLIENT_SECRET=GOCSPX-81x2FcCk...
GOOGLE_ADS_CUSTOMER_ID=2329750396
GOOGLE_ADS_REFRESH_TOKEN=1//04608BubVpuVb...  (expires in 7 days — ask XPAT to publish app to production)
```

---

---

## Design

### Architecture Diagram

```
Meta Marketing API  ──┐
                       ├──► pipeline/xpat-ads/  ──► data/artifacts/xpat-ad-performance.json
Google Ads API     ──┘              │
                                    │ normalize to unified schema
                                    ▼
                         lib/ai/ad-performance-tools.ts  (reads artifact)
                                    │
                                    ▼
                         lib/ai/ad-analyst-agent.ts  (Bedrock / AI Gateway)
                                    │
                                    ▼
                         app/api/ad-analyst/route.ts
                                    │
                                    ▼
                         components/shell/AdAnalystChat.tsx
                                    │
                                    ▼
                         app/playbook/page.tsx  (wired in)
```

---

### Unified Ad Performance Schema

Both Meta and Google data will be normalized into this schema before storage:

```typescript
type AdPerformanceRecord = {
  // Identity
  platform: "Meta" | "Google"
  campaignId: string
  campaignName: string
  adSetId: string | null
  adSetName: string | null
  status: "ACTIVE" | "PAUSED" | "ARCHIVED"

  // Time
  date: string            // ISO date YYYY-MM-DD
  capturedAt: string      // ISO timestamp

  // Geography
  geoName: string | null  // e.g. "Dallas", "San Jose"
  geoId: string | null    // market geoid if matchable

  // Spend
  spendUsd: number        // actual USD spent

  // Volume
  impressions: number
  clicks: number
  reach: number | null

  // Rates
  ctr: number | null      // clicks / impressions
  cpc: number | null      // cost per click in USD
  cpm: number | null      // cost per 1000 impressions in USD

  // Conversions (what Meta/Google report as conversions)
  conversions: number | null
  cpa: number | null      // cost per conversion in USD

  // Creative
  objective: string | null
  creative: string | null
}
```

---

### Artifact Structure

```json
{
  "meta": {
    "family": "xpat-ad-performance",
    "version": 1,
    "generatedAt": "2026-08-13T00:00:00.000Z",
    "provenance": "live",
    "source": "Meta Marketing API + Google Ads API",
    "method": "Authenticated read-only pull from XPAT's own ad accounts",
    "refreshCadence": "Every 6 hours via pipeline",
    "caveats": [
      "Conversion counts are platform-reported and may use different attribution windows",
      "Google and Meta use different conversion definitions — compare with caution",
      "Geographic data is campaign-level targeting, not individual user location"
    ]
  },
  "data": {
    "dateRange": { "from": "2026-07-14", "to": "2026-08-13" },
    "platforms": ["Meta", "Google"],
    "records": [ ... ]
  }
}
```

---

### AI Analyst — What It Can and Cannot Answer

**CAN answer (owns the data):**
- Campaign spend by platform, market, date range
- CPA, CPC, CPM, CTR metrics
- Which campaigns / ad sets are performing best/worst
- Platform comparison (Meta vs Google for same market)
- Trend over time (week over week, month over month)
- Budget efficiency questions

**CANNOT answer (no data):**
- Attribution to actual conversions (signup, KYC, first transfer) — needs XPAT backend webhook
- ROAS (no revenue data)
- LTV or retention metrics
- Individual user behaviour

---

---

## Implementation Plan

### Phase 1 — Data Pipeline (Days 1–2)

#### Task 1.1 — Meta Performance Pipeline
**File:** `pipeline/xpat-ads/meta-performance.mjs`

Calls Meta Marketing API:
```
GET /v20.0/act_759029483952879/insights
  ?fields=campaign_name,adset_name,spend,impressions,clicks,reach,
          ctr,cpc,cpm,actions,cost_per_action_type,objective
  &date_preset=last_30d
  &level=adset
  &time_increment=1
  &access_token={META_ACCESS_TOKEN}
```

Returns daily breakdown per ad set. Normalizes to `AdPerformanceRecord[]`.

#### Task 1.2 — Google Performance Pipeline
**File:** `pipeline/xpat-ads/google-performance.mjs`

Calls Google Ads API using `google-ads-api` library:
```sql
SELECT
  campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
  ad_group.id, ad_group.name,
  metrics.impressions, metrics.clicks, metrics.cost_micros,
  metrics.ctr, metrics.average_cpc, metrics.average_cpm,
  metrics.conversions, metrics.cost_per_conversion,
  segments.date
FROM ad_group
WHERE segments.date DURING LAST_30_DAYS
ORDER BY segments.date DESC
```

Converts `cost_micros` to USD (divide by 1,000,000). Normalizes to `AdPerformanceRecord[]`.

#### Task 1.3 — Normalize + Write Artifact
**File:** `pipeline/xpat-ads/normalize.mjs`

- Merges Meta + Google records into one array
- Attempts to match `geoName` to market geoids from `markets.json`
- Writes `data/artifacts/xpat-ad-performance.json` using `writeDeterministicJson`

#### Task 1.4 — Run Orchestrator
**File:** `pipeline/xpat-ads/run-xpat-ads.mjs`

```js
export async function runXpatAds() {
  const metaRecords = await runMetaPerformance();
  const googleRecords = await runGooglePerformance();
  return await runNormalize({ metaRecords, googleRecords });
}
```

#### Task 1.5 — Wire into pipeline/run.mjs
Add `case "xpat-ads": await runXpatAds(); break;` to the switch.

Run with: `node pipeline/run.mjs xpat-ads`

---

### Phase 2 — AI Tools Layer (Day 3)

#### Task 2.1 — Ad Performance Tools
**File:** `lib/ai/ad-performance-tools.ts`

Four tools following the exact same pattern as `evidence-tools.ts`:

```typescript
// Tool 1 — Get campaign performance
getCampaignPerformance({
  platform?: "Meta" | "Google",  // optional filter
  dateRange?: "last_7d" | "last_30d" | "last_90d",
  sortBy?: "spend" | "cpa" | "ctr" | "impressions"
})
// Returns: top campaigns with all metrics

// Tool 2 — Get market performance
getMarketPerformance({
  market: string,       // market name or geoid
  platform?: "Meta" | "Google"
})
// Returns: aggregated metrics for all campaigns targeting that market

// Tool 3 — Compare platforms
comparePlatforms({
  metric: "cpa" | "cpc" | "ctr" | "spend",
  dateRange?: "last_7d" | "last_30d"
})
// Returns: Meta vs Google side by side for the metric

// Tool 4 — Get performance summary
getPerformanceSummary({
  dateRange?: "last_7d" | "last_30d"
})
// Returns: total spend, total impressions, avg CPA, best/worst campaigns
```

Each tool reads from `data/artifacts/xpat-ad-performance.json` and returns a `source` envelope for citation.

---

### Phase 3 — AI Agent (Day 3)

#### Task 3.1 — Ad Analyst Agent
**File:** `lib/ai/ad-analyst-agent.ts`

```typescript
export const AD_ANALYST_INSTRUCTIONS = [
  "You are XPAT's ad performance analyst. Answer questions about XPAT's own Meta and Google Ads campaign data.",
  "",
  "Rules:",
  "- Every claim must come from a tool result. Never invent metrics.",
  "- Always cite the platform, campaign name, and date range.",
  "- Costs are in USD. Conversions are platform-reported.",
  "- You CANNOT answer questions about actual conversions to customers (signup/KYC/transfer) — that requires XPAT backend data. Say: 'Platform-reported conversions are available, but verified customer conversion data requires the attribution webhook.'",
  "- Use at most 6 tool steps.",
].join("\n");

export const adAnalystAgent = new ToolLoopAgent({
  model: BRIEF_MODEL,
  tools: adPerformanceTools,
  instructions: AD_ANALYST_INSTRUCTIONS,
  stopWhen: stepCountIs(6),
});
```

---

### Phase 4 — API Route (Day 4)

#### Task 4.1 — Ad Analyst API Route
**File:** `app/api/ad-analyst/route.ts`

Copy pattern from `app/api/evidence/route.ts` — same structure, uses `adAnalystAgent` instead of `evidenceAgent`.

---

### Phase 5 — UI Component (Day 4)

#### Task 5.1 — Ad Analyst Chat Component
**File:** `components/shell/AdAnalystChat.tsx`

Copy pattern from `components/shell/EvidenceChat.tsx` with:
- Different title: "Ask the ad analyst"
- Different suggestions:
  - "Which campaign has the lowest CPA?"
  - "How does Meta compare to Google this month?"
  - "What's our total spend in the last 30 days?"
- Calls `/api/ad-analyst` instead of `/api/evidence`
- Different "connector-needed" message referencing ad credentials

#### Task 5.2 — Wire into Playbook Page
**File:** `app/playbook/page.tsx`

Add `<AdAnalystChat aiEnabled={aiEnabled} />` at the bottom of the page — same pattern as the evidence trigger button on Competitors page.

---

### Phase 6 — Tests (Day 5)

#### Task 6.1 — Pipeline tests
`pipeline/xpat-ads/meta-performance.test.mjs` — mock API response, test normalization
`pipeline/xpat-ads/google-performance.test.mjs` — mock API response, test normalization

#### Task 6.2 — Tool tests
`lib/ai/ad-performance-tools.test.ts` — test each tool with fixture artifact data

#### Task 6.3 — Update CI
Add `GOOGLE_ADS_*` and `META_*` env vars to `.env.example` (no values, just keys)

---

## File Checklist

### New Files to Create

```
pipeline/xpat-ads/
  meta-performance.mjs
  meta-performance.test.mjs
  google-performance.mjs
  google-performance.test.mjs
  normalize.mjs
  normalize.test.mjs
  run-xpat-ads.mjs

lib/ai/
  ad-performance-tools.ts
  ad-performance-tools.test.ts
  ad-analyst-agent.ts

app/api/ad-analyst/
  route.ts

components/shell/
  AdAnalystChat.tsx

data/artifacts/
  xpat-ad-performance.json  (generated by pipeline)
```

### Existing Files to Modify

```
pipeline/run.mjs            → add "xpat-ads" case
app/playbook/page.tsx       → add AdAnalystChat component
.env.example                → add new env variable keys
```

---

## Sample Questions the Analyst Will Answer

| Question | Tool Called | Answer Type |
|---|---|---|
| "Which campaign has lowest CPA?" | getCampaignPerformance | Ranked list with CPA |
| "What's our total spend this month?" | getPerformanceSummary | Aggregated spend USD |
| "Is Google or Meta more efficient in Dallas?" | getMarketPerformance x2 | Platform comparison |
| "How did CPC change week over week?" | getCampaignPerformance | Trend comparison |
| "Which 3 ad sets have best CTR?" | getCampaignPerformance | Sorted by CTR |
| "What's our ROAS?" | — | Refused — no revenue data |

---

## Dependencies to Install

```bash
pnpm add google-ads-api
```

Meta uses the standard `fetch` — no additional package needed.

---

## Risk and Mitigations

| Risk | Mitigation |
|---|---|
| Google Refresh Token expires in 7 days | Ask XPAT to publish OAuth app to production mode immediately |
| Meta token format corrupted in transit | Token verified working via Access Token Debugger — store as single line in .env.local |
| Google Ads account has no campaign data | Pipeline writes empty artifact gracefully, chat shows "no data available for this period" |
| Meta API rate limits | 200 calls/hour per token — our pipeline makes ~5 calls. No concern. |
| Cost data sensitivity | Data stored only in private `.env.local` and `data/artifacts/` — never committed to git |

---

## Timeline

| Day | Task | Output |
|---|---|---|
| Day 1 | meta-performance.mjs + google-performance.mjs | Pipeline pulls real data |
| Day 2 | normalize.mjs + run-xpat-ads.mjs + wire run.mjs | `xpat-ad-performance.json` artifact generated |
| Day 3 | ad-performance-tools.ts + ad-analyst-agent.ts | AI tools and agent ready |
| Day 4 | API route + AdAnalystChat component + wire Playbook | End-to-end working |
| Day 5 | Tests + .env.example update + verification | All tests passing, demo ready |

---

*Infinitra Innovations | XPAT Intelligence Platform | August 2026*
*Credentials verified: Meta ✅ Google ✅ | Ready to build*
