# XPAT Ads Intelligence Pipeline — AWS Implementation Plan

**Created:** 2026-10-13
**Status:** 🟡 In Progress
**Owner:** Kangkana

---

## Overview

Migrate the ad intelligence pipeline from local JSON files to a fully automated AWS infrastructure with:
- **S3** for raw data storage (organized by source)
- **Lambda** for automated daily ingestion and transformation
- **DynamoDB** for queryable, joined data
- **EventBridge** for scheduled triggers

---

## Architecture Diagram

```
EventBridge (Daily 6 AM UTC)
        │
        ▼
┌───────────────────┐      ┌─────────────────────────────────────────────────┐
│  Lambda: Ingest   │─────▶│  S3: xpat-ads-raw-data                          │
│  (Google Ads API) │      │  ├── /campaigns/2026-10-13/data.json            │
└───────────────────┘      │  ├── /adgroups/2026-10-13/data.json             │
                           │  ├── /keywords/2026-10-13/data.json             │
                           │  ├── /search-terms/2026-10-13/data.json         │
                           │  ├── /ads/2026-10-13/data.json                  │
                           │  ├── /geo/2026-10-13/data.json                  │
                           │  ├── /devices/2026-10-13/data.json              │
                           │  └── /signups/latest.csv  (manual Metabase)     │
                           └─────────────────────────────────────────────────┘
                                          │
                                          │ S3 Event Trigger
                                          ▼
                           ┌───────────────────┐
                           │ Lambda: Transform │
                           │ (Join & Calculate)│
                           └─────────┬─────────┘
                                     │
                                     ▼
                           ┌─────────────────────────────────────────────────┐
                           │  DynamoDB: xpat-ads-intelligence                │
                           │  - Pre-joined campaign→adgroup→keyword→search   │
                           │  - Includes signup/transfer data                │
                           │  - Ready for agent queries                      │
                           └─────────────────────────────────────────────────┘
                                     │
                                     ▼
                           ┌─────────────────────────────────────────────────┐
                           │  XPAT OS App (Agent Tools)                      │
                           │  - Reads from DynamoDB                          │
                           │  - Powers Ad Analyst chat                       │
                           └─────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Infrastructure Setup
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 1.1 | Create CloudFormation template — S3 bucket | ✅ Done | `infra/ads-pipeline/cloudformation.yaml` | Bucket: `xpat-ads-raw-data-{env}` |
| 1.2 | Add S3 folder structure policy | ✅ Done | Same file | Lifecycle rules, S3 trigger via Custom Resource |
| 1.3 | Add DynamoDB table | ✅ Done | Same file | Table: `xpat-ads-intelligence-{env}` |
| 1.4 | Add DynamoDB GSIs | ✅ Done | Same file | GSI-ByDate, GSI-ByKeyword |
| 1.5 | Add IAM roles for Lambdas | ✅ Done | Same file | IngestLambdaRole, TransformLambdaRole |
| 1.6 | Add Secrets Manager for Google Ads credentials | ✅ Done | Same file | Placeholder values to update after deploy |

### Phase 2: Ingestion Lambda
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 2.1 | Create Lambda function scaffold | ✅ Done | `infra/ads-pipeline/lambda/ingest/index.mjs` | Node.js 20.x runtime |
| 2.2 | Implement OAuth token refresh | ✅ Done | Same file | Read from Secrets Manager |
| 2.3 | Implement incremental date tracking | ✅ Done | Same file | Store last pull date in S3 marker file |
| 2.4 | Pull campaigns data | ✅ Done | Same file | GAQL query → S3 |
| 2.5 | Pull ad groups data | ✅ Done | Same file | Included in campaigns query |
| 2.6 | Pull keywords data | ✅ Done | Same file | GAQL query → S3 |
| 2.7 | Pull search terms data | ✅ Done | Same file | GAQL query → S3 |
| 2.8 | Pull ads data | ✅ Done | Same file | GAQL query → S3 |
| 2.9 | Pull geo data | ✅ Done | Same file | GAQL query → S3 |
| 2.10 | Pull devices data | ✅ Done | Same file | GAQL query → S3 |
| 2.11 | Add EventBridge schedule (daily 6 AM UTC) | ✅ Done | CloudFormation | Deployed in Phase 1 |
| 2.12 | Add CloudFormation for Lambda | ✅ Done | `cloudformation.yaml` | Deployed in Phase 1 |

**Test Results (2026-10-12):**
- Full refresh: 90 days (2026-07-14 → 2026-10-12)
- campaigns: 425 rows
- keywords: 2,854 rows
- search-terms: 10,000 rows
- ads: 18 rows
- geo: 591 rows
- devices: 1,069 rows
- conversions: 100 rows
- Duration: ~14s, Memory: 184 MB

### Phase 3: Transform Lambda
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 3.1 | Create Lambda function scaffold | ✅ Done | `infra/ads-pipeline/lambda/transform/index.mjs` | Triggered by S3 event |
| 3.2 | Read raw data from S3 | ✅ Done | Same file | All 6 sources in parallel |
| 3.3 | Read signups CSV from S3 | ⏸️ Deferred | — | Pending Metabase export format |
| 3.4 | Join campaign → adgroup → keyword | ✅ Done | Same file | By campaignId, adGroupId |
| 3.5 | Join search terms to keywords | ✅ Done | Same file | Top 10 by spend per ad group |
| 3.6 | Join signup data by UTM campaign | ⏸️ Deferred | — | Pending signup CSV |
| 3.7 | Calculate derived metrics | ✅ Done | Same file | isWastedSpend, isHighCpc, isLowQuality |
| 3.8 | Write to DynamoDB | ✅ Done | Same file | Batch write with 25-item batches |
| 3.9 | Add S3 trigger in CloudFormation | ✅ Done | `cloudformation.yaml` | Custom resource for S3 notification |
| 3.10 | Add CloudFormation for Lambda | ✅ Done | `cloudformation.yaml` | Deployed in Phase 1 |

**Test Results (2026-10-12):**
- S3 sources read: campaigns (425), keywords (2854), search-terms (10000), ads (18), geo (591), devices (1069)
- Records built: 49 (37 keyword records + 12 campaign summaries)
- Written to DynamoDB: 49 (0 failed)
- GSI-ByDate: ✅ Working
- GSI-ByKeyword: ✅ Working
- Duration: ~1.7s, Memory: 141 MB

### Phase 4: Agent Tools Update
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 4.1 | Create DynamoDB client utility | ✅ Done | `lib/ai/dynamodb-client.ts` | Singleton client with query helpers |
| 4.2 | Update getGoogleAdsCampaignSummary | ✅ Done | `lib/ai/ad-performance-tools-dynamodb.ts` | getCampaignSummary tool |
| 4.3 | Update getGoogleAdsKeywords | ✅ Done | Same file | getKeywordsByCampaign, searchByKeyword |
| 4.4 | Update getGoogleAdsSearchTerms | ✅ Done | Same file | getSearchTermsForKeyword (pre-joined) |
| 4.5 | Add getKeywordFullContext tool | ✅ Done | Same file | Single query for full hierarchy |
| 4.6 | Update getGoogleAdsDailyTimeSeries | ✅ Done | Same file | getDailyPerformance |
| 4.7 | Add fallback to local JSON | ✅ Done | `lib/ai/ad-analyst-agent.ts` | Env-based switching (ADS_DYNAMODB_TABLE) |
| 4.8 | Update agent instructions | ⏸️ Deferred | — | Instructions work with both tool sets |

**DynamoDB Tools Created:**
1. `getCampaignSummary` — Campaign metrics for a date
2. `getKeywordsByCampaign` — Keywords with nested search terms
3. `searchByKeyword` — GSI-ByKeyword lookup
4. `getDailyPerformance` — All data for a date
5. `getKeywordFullContext` — Pre-joined full hierarchy
6. `getWastedSpendKeywords` — Zero-conversion keywords
7. `getSearchTermsForKeyword` — Aggregated search terms

**Environment Variable:**
- `ADS_DYNAMODB_TABLE=xpat-ads-intelligence-dev` → Use DynamoDB tools
- Not set → Use local JSON tools (fallback)

### Phase 5: Deployment & Testing
| # | Task | Status | Files | Notes |
|---|------|--------|-------|-------|
| 5.1 | Create deploy script | ✅ Done | `aws-scripts/deploy-ads-pipeline.mjs` | Full deploy, lambda-only, stack-only options |
| 5.2 | Create teardown script | ✅ Done | `aws-scripts/teardown-ads-pipeline.mjs` | S3 emptying, confirmation, --force option |
| 5.3 | Populate Secrets Manager | ✅ Done | — | Credentials populated from .env.local |
| 5.4 | Deploy to dev environment | ✅ Done | — | Stack: xpat-ads-pipeline-dev |
| 5.5 | Upload test signups CSV | ⏸️ Deferred | — | Pending Metabase export format |
| 5.6 | Trigger manual Lambda run | ✅ Done | — | Full E2E flow verified |
| 5.7 | Test agent queries | ✅ Done | — | DynamoDB tools returning data |
| 5.8 | Deploy to production | ⏸️ Pending | — | After dev validation period |

**End-to-End Test Results:**
```
Ingest Lambda:
  - Incremental pull: 2026-10-11 → 2026-10-13 (3 days)
  - campaigns: 10 rows
  - keywords: 95 rows
  - search-terms: 1,201 rows
  - ads: 5 rows
  - geo: 21 rows
  - devices: 26 rows
  - Duration: ~13s

Transform Lambda:
  - Dates processed: 2026-10-11, 2026-10-12
  - Records built: 105
  - Written to DynamoDB: 105 (0 failed)
  - Duration: ~2s

DynamoDB Query Test:
  - Campaign summaries for 2026-10-12: 5 campaigns
  - Full data returned: spend, clicks, conversions, geo summary
```

**Alerting:**
- SNS Topic: `xpat-ads-pipeline-alerts-dev`
- Alarms: Ingest errors, Transform errors, Ingest duration (240s warning)

---

## DynamoDB Schema

### Table: `xpat-ads-intelligence-{env}`

**Primary Key:**
| Key | Format | Example |
|-----|--------|---------|
| PK | `CAMPAIGN#{campaignId}` | `CAMPAIGN#23867726121` |
| SK | `DATE#{date}#ADGROUP#{adGroupId}#KW#{keywordHash}` | `DATE#2026-10-13#ADGROUP#200719043990#KW#a1b2c3` |

**Attributes:**
```json
{
  "PK": "CAMPAIGN#23867726121",
  "SK": "DATE#2026-10-13#ADGROUP#200719043990#KW#a1b2c3",
  
  "campaignId": "23867726121",
  "campaignName": "Search Ads | Intent | May 2026",
  "campaignStatus": "ENABLED",
  "channelType": "SEARCH",
  
  "adGroupId": "200719043990",
  "adGroupName": "Remittance Rate to India | RRI",
  
  "keyword": "send money to india",
  "matchType": "PHRASE",
  "qualityScore": 7,
  
  "date": "2026-10-13",
  
  "impressions": 150,
  "clicks": 12,
  "spend": 98.50,
  "conversions": 2,
  "ctr": 8.0,
  "cpc": 8.21,
  "conversionRate": 16.67,
  
  "searchTerms": [
    { "term": "send money to india from usa", "impressions": 80, "clicks": 7, "spend": 55.00 },
    { "term": "how to send money to india", "impressions": 70, "clicks": 5, "spend": 43.50 }
  ],
  
  "signups": 3,
  "transfers": 1,
  "signupConversionRate": 25.0,
  "transferConversionRate": 8.33,
  
  "updatedAt": "2026-10-13T06:15:00Z"
}
```

**GSI-ByDate:**
| Key | Format |
|-----|--------|
| PK | `DATE#{date}` |
| SK | `CAMPAIGN#{campaignId}#ADGROUP#{adGroupId}` |

**GSI-ByKeyword:**
| Key | Format |
|-----|--------|
| PK | `KEYWORD#{keywordNormalized}` |
| SK | `DATE#{date}#CAMPAIGN#{campaignId}` |

---

## S3 Folder Structure

```
s3://xpat-ads-raw-data-{env}/
├── campaigns/
│   ├── 2026-10-13/data.json
│   ├── 2026-10-12/data.json
│   └── ...
├── adgroups/
│   ├── 2026-10-13/data.json
│   └── ...
├── keywords/
│   ├── 2026-10-13/data.json
│   └── ...
├── search-terms/
│   ├── 2026-10-13/data.json
│   └── ...
├── ads/
│   ├── 2026-10-13/data.json
│   └── ...
├── geo/
│   ├── 2026-10-13/data.json
│   └── ...
├── devices/
│   ├── 2026-10-13/data.json
│   └── ...
├── signups/
│   └── latest.csv              ← Manual upload from Metabase
└── _meta/
    └── last-pull-date.json     ← Tracks incremental pull
```

---

## Environment Variables / Secrets

### Secrets Manager: `xpat-ads-pipeline/{env}`
```json
{
  "GOOGLE_ADS_CLIENT_ID": "190067194515-xxx.apps.googleusercontent.com",
  "GOOGLE_ADS_CLIENT_SECRET": "GOCSPX-xxx",
  "GOOGLE_ADS_REFRESH_TOKEN": "1//04xxx",
  "GOOGLE_ADS_DEVELOPER_TOKEN": "fxKOSpq23xxx",
  "GOOGLE_ADS_CUSTOMER_ID": "2329750396",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID": "2329750396"
}
```

### Lambda Environment Variables
```
ENVIRONMENT=dev|prod
RAW_BUCKET_NAME=xpat-ads-raw-data-{env}
DYNAMODB_TABLE=xpat-ads-intelligence-{env}
SECRETS_ARN=arn:aws:secretsmanager:...
```

---

## Cost Estimate (Monthly)

| Service | Usage | Cost |
|---------|-------|------|
| S3 | ~100 MB storage, 1K requests/day | $0.05 |
| DynamoDB | 100K WCU, 500K RCU (on-demand) | $2.00 |
| Lambda | 60 invocations × 30s × 512MB | $0.10 |
| EventBridge | 30 scheduled events | Free |
| Secrets Manager | 1 secret, 60 reads/month | $0.40 |
| **Total** | | **~$3/month** |

---

## Rollback Plan

If issues occur after deployment:

1. **Agent queries fail:** Tools have fallback to local JSON (`data/artifacts/google-ads-intelligence.json`)
2. **Lambda fails:** Manual pipeline still works (`node pipeline/xpat-ads/fetch-google-ads-intelligence.mjs`)
3. **Full rollback:** Delete CloudFormation stack, revert tool changes

---

## Open Questions

| # | Question | Answer | Status |
|---|----------|--------|--------|
| 1 | Which AWS region? | `ap-southeast-2` (existing infra) | ✅ |
| 2 | Signups CSV format? | TBD — need Metabase export format | ⬜ Pending |
| 3 | Data retention policy? | Keep 90 days in S3, 30 days in DynamoDB? | ⬜ Pending |
| 4 | Alert on Lambda failure? | SNS → Email? | ⬜ Pending |

---

## Progress Log

| Date | Phase | Task | Status | Notes |
|------|-------|------|--------|-------|
| 2026-10-13 | — | Created implementation plan | ✅ Done | This document |
| 2026-10-13 | 1 | Phase 1 Infrastructure complete | ✅ Done | CloudFormation template validated & deployed |
| 2026-10-13 | 2 | Phase 2 Ingest Lambda complete | ✅ Done | 7 sources, 90 days, 15K+ rows in S3 |
| 2026-10-13 | 3 | Phase 3 Transform Lambda complete | ✅ Done | 49 records in DynamoDB, GSIs working |
| 2026-10-13 | 4 | Phase 4 Agent Tools complete | ✅ Done | 7 DynamoDB tools, env-based switching |
| 2026-10-13 | 5 | Phase 5 Deployment & Testing complete | ✅ Done | E2E verified, 105 records, SNS alerting |
| | | | | |

---

## Files Created/Modified

### New Files
- [x] `infra/ads-pipeline/cloudformation.yaml` — Full AWS infrastructure (S3, DynamoDB, Lambda, IAM, SNS)
- [x] `infra/ads-pipeline/lambda/ingest/index.mjs` — Google Ads API → S3
- [x] `infra/ads-pipeline/lambda/ingest/package.json`
- [x] `infra/ads-pipeline/lambda/transform/index.mjs` — S3 → DynamoDB
- [x] `infra/ads-pipeline/lambda/transform/package.json`
- [x] `aws-scripts/deploy-ads-pipeline.mjs` — Deployment script
- [x] `aws-scripts/teardown-ads-pipeline.mjs` — Cleanup script
- [x] `lib/ai/dynamodb-client.ts` — DynamoDB query helpers
- [x] `lib/ai/ad-performance-tools-dynamodb.ts` — 7 DynamoDB-based agent tools

### Modified Files
- [x] `lib/ai/ad-analyst-agent.ts` — Env-based tool switching
- [x] `.env.local` — Added ADS_DYNAMODB_TABLE, ADS_DYNAMODB_REGION

---

## Next Step

**Start with Phase 1.1:** Create CloudFormation template with S3 bucket.

```bash
# When ready to start:
# 1. Create infra/ads-pipeline/cloudformation.yaml
# 2. Deploy with: aws cloudformation deploy --template-file infra/ads-pipeline/cloudformation.yaml --stack-name xpat-ads-pipeline-dev
```
