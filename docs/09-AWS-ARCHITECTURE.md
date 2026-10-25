# XPAT Intelligence Platform — Full AWS Architecture & Cost Analysis

**Project:** XPAT Intelligence Platform — All 3 Modules
**Prepared by:** Infinitra Innovations
**Date:** August 2026
**Covers:** Community Intelligence + Ad Performance Intelligence + Customer Map

---

## The 3 Deliverables

| Module | What It Does | AWS Pipeline |
|---|---|---|
| **Module A** | Community Intelligence | Reddit/Social listener → Bedrock classifier → Slack digest |
| **Module B** | Ad Performance Intelligence | Meta + Google Ads → Unified data store → AI analyst |
| **Module C** | Customer Map | Census + OpenStreetMap → Scored market map → Interactive UI |

---

---

## Full Platform Architecture Diagram

```
═══════════════════════════════════════════════════════════════════════════════
                    EXTERNAL DATA SOURCES
═══════════════════════════════════════════════════════════════════════════════

  [Reddit API]  [Meta Marketing API]  [Google Ads API]  [US Census API]
  [YouTube]     [Meta Ad Account]     [Google Ads]      [OpenStreetMap]
  [Trustpilot]                                           [DOL LCA Data]
  [App Store]                                            [SEVIS Students]

═══════════════════════════════════════════════════════════════════════════════
                    INGESTION LAYER (AWS Lambda + EventBridge)
═══════════════════════════════════════════════════════════════════════════════

  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ MODULE A            │  │ MODULE B            │  │ MODULE C            │
  │ community-collector │  │ ad-collector        │  │ map-pipeline        │
  │ Lambda              │  │ Lambda              │  │ Lambda              │
  │                     │  │                     │  │                     │
  │ Every 30 min        │  │ Every 6 hours       │  │ Weekly              │
  │ EventBridge cron    │  │ EventBridge cron    │  │ EventBridge cron    │
  └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
             │                        │                         │
═════════════╪════════════════════════╪═════════════════════════╪═════════════
                    STORAGE LAYER (S3 + DynamoDB)
═════════════╪════════════════════════╪═════════════════════════╪═════════════
             ▼                        ▼                         ▼
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ S3: raw/community/  │  │ S3: raw/ads/        │  │ S3: raw/map/        │
  │   reddit/           │  │   meta/             │  │   census/           │
  │   youtube/          │  │   google/           │  │   osm/              │
  │   reviews/          │  └──────────┬──────────┘  └──────────┬──────────┘
  └──────────┬──────────┘             │                         │
             │                        ▼                         ▼
             │             ┌─────────────────────┐  ┌─────────────────────┐
             │             │ DynamoDB:           │  │ DynamoDB:           │
             │             │ xpat-ad-performance │  │ xpat-markets        │
             │             │                     │  │ (scored + tiered)   │
             │             └──────────┬──────────┘  └──────────┬──────────┘
             │                        │                         │
═════════════╪════════════════════════╪═════════════════════════╪═════════════
                    PROCESSING LAYER (Lambda + Bedrock)
═════════════╪════════════════════════╪═════════════════════════╪═════════════
             ▼                        ▼                         ▼
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ community-classifier│  │ ad-classifier       │  │ map-scorer          │
  │ Lambda              │  │ Lambda              │  │ Lambda              │
  │                     │  │                     │  │                     │
  │ Bedrock Claude Haiku│  │ Normalize schema    │  │ Score + tier        │
  │ Tags: intent,       │  │ Match market geoids │  │ markets by NRI      │
  │ sentiment, urgency, │  │ Aggregate metrics   │  │ density + anchors   │
  │ competitor, geo,    │  └──────────┬──────────┘  └──────────┬──────────┘
  │ language            │             │                         │
  └──────────┬──────────┘             │                         │
             │                        │                         │
═════════════╪════════════════════════╪═════════════════════════╪═════════════
                    ARTIFACT LAYER (S3 Artifacts)
═════════════╪════════════════════════╪═════════════════════════╪═════════════
             ▼                        ▼                         ▼
  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
  │ S3 artifacts/       │  │ S3 artifacts/       │  │ S3 artifacts/       │
  │ community-signals   │  │ xpat-ad-performance │  │ markets.json        │
  │ .json               │  │ .json               │  │ markets-geojson     │
  └──────────┬──────────┘  └──────────┬──────────┘  │ .json               │
             │                        │             └──────────┬──────────┘
═════════════╪════════════════════════╪═════════════════════════╪═════════════
                    NOTIFICATION LAYER (SES + Slack)
═════════════╪════════════════════════╪═════════════════════════╪═════════════
             ▼                        ▼
  ┌─────────────────────┐  ┌─────────────────────┐
  │ daily-digest Lambda │  │ anomaly-alert Lambda │
  │                     │  │                     │
  │ Fires daily at 8am  │  │ Fires on anomaly    │
  │ Bedrock Sonnet      │  │ detected in metrics │
  │ generates digest    │  │ (CAC spike etc.)    │
  │ → Slack webhook     │  │ → Slack webhook     │
  └─────────────────────┘  └─────────────────────┘

═════════════════════════════════════════════════════════════════════════════
                    AI LAYER (Bedrock + Next.js)
═════════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────────────────────────────────────────────┐
  │                    Next.js App (xpat-os on Vercel/Amplify)           │
  │                                                                      │
  │  Community Intelligence  │  Ad Performance AI   │  Customer Map     │
  │  /signals page           │  /playbook page       │  / (root) page    │
  │  Ask the evidence chat   │  Ad Analyst chat      │  Market Map       │
  │                          │  /api/ad-analyst      │                   │
  └──────────────────────────────────────────────────────────────────────┘
                          │               │
                          ▼               ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                       Amazon Bedrock                                 │
  │                                                                      │
  │  Claude 3.5 Haiku  →  Classification, simple queries, digest        │
  │  Claude 3.5 Sonnet →  Ad analyst, complex reasoning, briefs         │
  │  Bedrock Guardrails → Prompt injection protection                   │
  └──────────────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════════════
                    SECURITY LAYER (IAM + Secrets Manager)
═════════════════════════════════════════════════════════════════════════

  ┌──────────────────────────────────────────────────────────────────────┐
  │                    AWS Secrets Manager                               │
  │                                                                      │
  │  /xpat/reddit/*        /xpat/meta/*        /xpat/google/*           │
  │  /xpat/slack/webhook   /xpat/census/*      /xpat/youtube/*          │
  └──────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │                    AWS IAM (Least Privilege)                         │
  │  Each Lambda has its own role with minimum required permissions      │
  └──────────────────────────────────────────────────────────────────────┘
```

---

---

## Module A — Community Intelligence Architecture

### AWS Services Used

| Service | Role | Config |
|---|---|---|
| EventBridge Scheduler | Triggers Reddit/social collection | Every 30 minutes |
| Lambda: `community-collector` | Fetches Reddit + other platform data | 512MB, 5 min timeout |
| Lambda: `community-classifier` | Bedrock Haiku classifies each post | 256MB, 3 min timeout |
| Lambda: `daily-digest` | Generates + sends Slack digest | 512MB, 5 min timeout |
| S3: `xpat-intelligence-raw` | Stores raw posts from all sources | `raw/community/` prefix |
| DynamoDB: `xpat-community-signals` | Stores classified posts | On-demand billing |
| Amazon Bedrock (Claude Haiku) | Classifies intent, sentiment, urgency | Per-token billing |
| Amazon Bedrock (Claude Sonnet) | Generates daily digest narrative | Per-token billing |
| Secrets Manager | Reddit API key, Slack webhook | 3 secrets |
| SNS (optional) | Alerts on classification errors | Standard tier |

### Data Flow — Module A

```
Every 30 min:
  EventBridge
    → community-collector Lambda
      → Reddit API (Mindcase/RedditAPIs): fetch posts
      → Write raw JSON → S3 raw/community/reddit/
    → S3 event triggers community-classifier Lambda
      → Read raw post
      → Bedrock Claude Haiku: classify intent/sentiment/urgency/competitor/geo/language
      → Write classified record → DynamoDB xpat-community-signals

Daily at 8am ET:
  EventBridge
    → daily-digest Lambda
      → Query DynamoDB: top signals from last 24h
      → Bedrock Claude Sonnet: generate digest narrative
      → POST to Slack webhook → XPAT's #intelligence channel
```

### DynamoDB Table — `xpat-community-signals`

```
PK: platform#postId          e.g. "Reddit#t3_abc123"
SK: capturedAt               e.g. "2026-08-13T14:00:00Z"

Attributes:
  title, body, url, subreddit, author, score, commentCount,
  intent, sentiment, urgency, competitor_mentioned,
  use_case, language, geo_market, geo_state,
  classified: boolean, classifiedAt, draftResponse
```

---

---

## Module B — Ad Performance Intelligence Architecture

### AWS Services Used

| Service | Role | Config |
|---|---|---|
| EventBridge Scheduler | Triggers ad data collection | Every 6 hours |
| Lambda: `ad-collector` | Fetches Meta + Google Ads data | 512MB, 5 min timeout |
| Lambda: `ad-classifier` | Normalizes + writes to DynamoDB | 256MB, 2 min timeout |
| Lambda: `artifact-writer` | Generates artifact JSON | 256MB, 2 min timeout |
| Lambda: `anomaly-detector` | Detects CAC spikes, budget anomalies | 256MB, 2 min timeout |
| S3: `xpat-intelligence-raw` | Stores raw ad API responses | `raw/ads/` prefix |
| S3: `xpat-intelligence-artifacts` | Stores generated artifact JSON | Versioned |
| DynamoDB: `xpat-ad-performance` | Stores normalized ad records | On-demand billing |
| Amazon Bedrock (Claude Sonnet) | AI analyst for ad questions | Per-token billing |
| Secrets Manager | Meta token, Google Ads credentials | 9 secrets |

### Data Flow — Module B

```
Every 6 hours:
  EventBridge
    → ad-collector Lambda
      → Meta Marketing API: fetch campaign insights (last 7 days)
      → Google Ads API: fetch campaign metrics (last 7 days)
      → Write raw JSON → S3 raw/ads/meta/ and raw/ads/google/
    → S3 event triggers ad-classifier Lambda
      → Read raw JSON
      → Normalize to unified AdPerformanceRecord schema
      → Match geoName to market geoid
      → Deduplicate records
      → Write to DynamoDB xpat-ad-performance
    → (30 min later) EventBridge triggers artifact-writer
      → Query DynamoDB: last 30 days
      → Aggregate by campaign/platform/market
      → Write xpat-ad-performance.json → S3 artifacts
      → (Optional) Trigger Vercel rebuild webhook

On user query:
  XPAT marketing team → AdAnalystChat UI
    → /api/ad-analyst route
    → Bedrock Claude Sonnet
    → ad-performance-tools (read artifact from S3)
    → Cited answer streamed to user
```

---

---

## Module C — Customer Map Architecture

### AWS Services Used

| Service | Role | Config |
|---|---|---|
| EventBridge Scheduler | Triggers map data refresh | Weekly |
| Lambda: `map-pipeline` | Fetches Census + OSM + LCA data | 1024MB, 15 min timeout |
| Lambda: `map-scorer` | Scores and tiers markets | 512MB, 5 min timeout |
| S3: `xpat-intelligence-raw` | Stores raw Census/OSM downloads | `raw/map/` prefix |
| S3: `xpat-intelligence-artifacts` | Stores markets.json + GeoJSON | Versioned |
| DynamoDB: `xpat-markets` | Hot data store for market lookups | On-demand billing |
| Secrets Manager | Census API key | 1 secret |
| Amazon Bedrock (Claude Sonnet) | Generates per-market AI briefs | Per-token billing |

### Data Flow — Module C

```
Weekly:
  EventBridge
    → map-pipeline Lambda
      → US Census API: fetch ACS 5-year estimates for all CBSAs
      → OpenStreetMap Overpass: fetch temples, groceries, cricket venues
      → DOL LCA data: employment proxy (H-1B/L-1 filings)
      → SEVIS student data
      → Write raw data → S3 raw/map/
    → map-scorer Lambda
      → Normalize all data sources
      → Apply scoring formula (35% population, 20% concentration, 20% anchors, 15% employment, 10% students)
      → Assign tiers (T1/T2/T3/T4)
      → Write markets.json + markets-geojson.json → S3 artifacts
      → Write to DynamoDB xpat-markets

On user request:
  User browses Market Map page
    → Next.js RSC reads markets.json artifact
    → MapLibre GL renders interactive map
    → Click market → MarketDrawer shows evidence
    → "Ask the evidence" chat → Bedrock reads artifact via tools
```

---

---

## Shared Infrastructure

These services are shared across all 3 modules:

### Amazon S3 — Bucket Structure

```
xpat-intelligence-raw/
  raw/
    community/
      reddit/2026/08/13/sweep-001.json
      youtube/2026/08/13/sweep-001.json
      reviews/2026/08/13/sweep-001.json
    ads/
      meta/2026/08/13/14-00.json
      google/2026/08/13/14-00.json
    map/
      census/2026-08.json
      osm/2026-08.json

xpat-intelligence-artifacts/
  artifacts/
    community-signals.json
    xpat-ad-performance.json
    markets.json
    markets-geojson.json
    market-briefs.json
```

### AWS CDK — Single Stack

All resources deployed as one CDK stack:

```
XpatIntelligencePlatformStack
  ├── Module A Resources
  │   ├── Lambda: community-collector
  │   ├── Lambda: community-classifier
  │   ├── Lambda: daily-digest
  │   ├── DynamoDB: xpat-community-signals
  │   └── EventBridge: 30-min schedule
  ├── Module B Resources
  │   ├── Lambda: ad-collector
  │   ├── Lambda: ad-classifier
  │   ├── Lambda: artifact-writer
  │   ├── Lambda: anomaly-detector
  │   ├── DynamoDB: xpat-ad-performance
  │   └── EventBridge: 6-hour schedule
  ├── Module C Resources
  │   ├── Lambda: map-pipeline
  │   ├── Lambda: map-scorer
  │   ├── DynamoDB: xpat-markets
  │   └── EventBridge: weekly schedule
  ├── Shared Resources
  │   ├── S3: xpat-intelligence-raw
  │   ├── S3: xpat-intelligence-artifacts
  │   ├── Secrets Manager: all credentials
  │   └── IAM Roles: one per Lambda
  └── AI Layer
      └── Bedrock: model access config
```

---

---

## Full Cost Analysis

### Module A — Community Intelligence

| Service | Usage | Monthly Cost |
|---|---|---|
| EventBridge | 1,440 triggers/month (30-min) | $0.00 |
| Lambda: community-collector | 1,440 × 30s × 512MB | ~$1.00 |
| Lambda: community-classifier | ~14,400 posts × 5s × 256MB | ~$0.50 |
| Lambda: daily-digest | 30 × 60s × 512MB | ~$0.08 |
| S3 raw storage | ~200MB/month | ~$0.005 |
| DynamoDB writes | ~14,400 records/month | ~$0.02 |
| **Bedrock Haiku** (classifier) | 14,400 posts × 500 tokens | **~$1.80** |
| **Bedrock Sonnet** (digest) | 30 digests × 2,000 tokens | **~$1.80** |
| Secrets Manager | 3 secrets | ~$1.20 |
| **Module A Total** | | **~$6.40/month** |

---

### Module B — Ad Performance Intelligence

| Service | Usage | Monthly Cost |
|---|---|---|
| EventBridge | 120 triggers/month (6-hour) | $0.00 |
| Lambda: ad-collector | 120 × 30s × 512MB | ~$0.12 |
| Lambda: ad-classifier | 120 × 10s × 256MB | ~$0.02 |
| Lambda: artifact-writer | 120 × 5s × 256MB | ~$0.01 |
| S3 raw + artifacts | ~50MB/month | ~$0.01 |
| DynamoDB | ~6,000 records/month | ~$0.04 |
| **Bedrock Sonnet** (analyst) | 600 queries × 3,000 tokens | **~$2.44** |
| Secrets Manager | 9 secrets | ~$3.60 |
| **Module B Total** | | **~$6.24/month** |

---

### Module C — Customer Map

| Service | Usage | Monthly Cost |
|---|---|---|
| EventBridge | 4 triggers/month (weekly) | $0.00 |
| Lambda: map-pipeline | 4 × 15min × 1024MB | ~$0.50 |
| Lambda: map-scorer | 4 × 5min × 512MB | ~$0.06 |
| S3 raw + artifacts | ~10MB/month | ~$0.001 |
| DynamoDB | ~3,600 markets, low writes | ~$0.01 |
| **Bedrock Sonnet** (briefs) | 100 briefs × 3,000 tokens | **~$0.41** |
| Secrets Manager | 1 secret (Census key) | ~$0.40 |
| **Module C Total** | | **~$1.38/month** |

---

### Shared Infrastructure

| Service | Usage | Monthly Cost |
|---|---|---|
| Vercel/Amplify hosting | Next.js app | ~$20.00 |
| CloudWatch Logs | All Lambdas | ~$2.00 |
| CDK / CloudFormation | Deployment tooling | $0.00 |
| **Shared Total** | | **~$22.00/month** |

---

### Full Platform Cost Summary

| Module | Monthly Cost |
|---|---|
| Module A — Community Intelligence | ~$6.40 |
| Module B — Ad Performance Intelligence | ~$6.24 |
| Module C — Customer Map | ~$1.38 |
| Shared (hosting + monitoring) | ~$22.00 |
| **Total Platform** | **~$36/month** |

---

### Budget Comparison

| | Amount |
|---|---|
| Budget presented to client | ~$180/month |
| Actual estimated cost | ~$36/month |
| **Headroom remaining** | **~$144/month (80% under budget)** |

The platform runs at **80% under budget**. The headroom covers:
- Increased Bedrock usage as XPAT team asks more questions
- Reddit data provider costs (Mindcase ~₹360 or RedditAPIs.com ~$72)
- Additional social platforms (YouTube, LinkedIn) in later weeks

---

### Cost Scaling Scenarios

| Scenario | Description | Est. Monthly |
|---|---|---|
| **Current PoC** | As designed above | ~$36/month |
| **+ Reddit data (Mindcase)** | Add Mindcase at ₹360/month | ~$40/month |
| **+ Reddit data (RedditAPIs.com)** | Add RedditAPIs.com at $72/month | ~$108/month |
| **Growth (2x queries)** | Double AI analyst usage | ~$55/month |
| **Scale (5x queries)** | 5x usage across all modules | ~$120/month |
| **Budget ceiling** | At $180/month budget | ~5x current usage |

---

---

## Lambda Functions Summary — All Modules

| Lambda | Module | Trigger | Memory | Timeout | Purpose |
|---|---|---|---|---|---|
| community-collector | A | EventBridge 30min | 512MB | 5 min | Fetch Reddit + social posts |
| community-classifier | A | S3 event | 256MB | 3 min | Bedrock classify each post |
| daily-digest | A | EventBridge 8am daily | 512MB | 5 min | Generate + send Slack digest |
| ad-collector | B | EventBridge 6h | 512MB | 5 min | Fetch Meta + Google Ads |
| ad-classifier | B | S3 event | 256MB | 2 min | Normalize + write DynamoDB |
| artifact-writer | B | EventBridge 6h+30min | 256MB | 2 min | Generate ad performance artifact |
| anomaly-detector | B | DynamoDB stream | 256MB | 1 min | Detect CAC/spend anomalies |
| map-pipeline | C | EventBridge weekly | 1024MB | 15 min | Fetch Census + OSM + LCA |
| map-scorer | C | S3 event | 512MB | 5 min | Score + tier all markets |
| **Total: 9 Lambdas** | | | | | |

---

## DynamoDB Tables Summary

| Table | Module | PK | SK | Records/month | TTL |
|---|---|---|---|---|---|
| xpat-community-signals | A | platform#postId | capturedAt | ~14,400 | 90 days |
| xpat-ad-performance | B | platform#campaignId | date | ~6,000 | 90 days |
| xpat-markets | C | geoid | updatedAt | ~3,600 (stable) | None |

---

## Secrets Manager — All Credentials

| Secret Path | Module | What |
|---|---|---|
| /xpat/reddit/client-id | A | Reddit OAuth client ID |
| /xpat/reddit/client-secret | A | Reddit OAuth client secret |
| /xpat/slack/webhook-url | A | Slack incoming webhook URL |
| /xpat/meta/access-token | B | Meta System User token |
| /xpat/meta/app-id | B | Meta App ID |
| /xpat/meta/app-secret | B | Meta App Secret |
| /xpat/meta/ad-account-id | B | XPAT's Meta Ad Account |
| /xpat/google/refresh-token | B | Google OAuth refresh token |
| /xpat/google/client-id | B | Google OAuth client ID |
| /xpat/google/client-secret | B | Google OAuth client secret |
| /xpat/google/developer-token | B | Google Ads developer token |
| /xpat/google/customer-id | B | XPAT's Google Ads account ID |
| /xpat/census/api-key | C | US Census API key |
| **Total: 13 secrets** | | ~$5.20/month |

---

## Week-by-Week Build Order

| Week | Module | AWS Resources Built |
|---|---|---|
| Week 1 | B (pivot) | CDK scaffold, ad-collector, ad-classifier, S3, DynamoDB B, Secrets Manager |
| Week 2 | B + A starts | artifact-writer, anomaly-detector, Ad Analyst AI, Slack setup |
| Week 3 | A | community-collector, community-classifier, DynamoDB A, daily-digest |
| Week 4 | A + B | Reddit data connected, ad attribution webhook defined |
| Week 5 | C | map-pipeline, map-scorer, DynamoDB C, Customer Map UI |
| Week 6 | All | End-to-end integration, monitoring, handoff |

---

*Infinitra Innovations | XPAT Intelligence Platform | August 2026*
*Full platform: 9 Lambda functions, 3 DynamoDB tables, 2 S3 buckets, 13 secrets*
*Estimated cost: ~$36/month — 80% under the $180/month client budget*
