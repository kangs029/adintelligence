# 02: Data Specification

Every artifact family: what it is, how it's acquired, its schema, QA rules, and
caveats. All schemas are illustrative TypeScript; the implementer defines the
canonical versions in `lib/types.ts` with zod schemas alongside.

General rules:
- Verify every external endpoint/API before coding against it; several are named
  from prior experience and may have changed.
- Each pipeline family is one command: `node pipeline/run.mjs <family>`.
- Every record that came from a URL keeps that URL. Every scraped/captured record
  stores BOTH `publishedAt` (when the content was created, if known) and
  `capturedAt` (when we fetched it). This distinction was a v1 bug; keep it fixed.
- Store approved raw inputs under ignored `data/raw/`. Obtain them from the
  authoritative public source or an approved sanitized handoff bundle. Record
  the release and source URL in artifact metadata.

---

## 1. markets — Census ACS audience layer (grounded)

**Upgrade from v1:** v1 hand-audited 29 metros. v2 pulls ALL metro/micropolitan
CBSAs programmatically and tiers them by rule, so coverage is complete and the
tier logic is inspectable.

- Source: US Census API, ACS 2024 5-year (or newest available 5-year release;
  record the release in meta). Verify table IDs at data.census.gov before coding.
  Target concepts: Asian Indian alone population (B02015 group or successor),
  total population (B01003), median household income (B19013, optional context).
  Pull margins of error alongside estimates.
- Geography: `metropolitan statistical area/micropolitan statistical area:*`
  (~930 areas). Secondary pull at county level for the top ~60 markets to enable
  sub-metro anchor context in the drawer.
- Derived per market: `localSharePct` (AI pop / total pop), `usSharePct` (share of
  national AI pop), `multipleOfUS` (localShare / national share), `moeReliability`
  (estimate/MOE ratio bucketed high/medium/low).

```ts
type Market = {
  geoid: string; name: string; state: string; states: string[];
  lat: number; lng: number;                       // internal point (Census)
  population: { asianIndian: number; moe: number; total: number };
  concentration: { localSharePct: number; usSharePct: number; multipleOfUS: number };
  income?: { medianHousehold: number; moe: number };
  moeReliability: 'high' | 'medium' | 'low';
  tier: 1 | 2 | 3 | 4;                            // see §3
  score: number;                                  // see §3
  anchorSummary?: { temples: number; groceries: number; cricket: number;
                    theaters: number; per10kAI: number };
  employmentProxy?: { lcaFilings: number; topEmployers: string[] };  // §4
  students?: { activeIndianStudents: number };                       // §5
};
```

QA: drop CBSAs with AI population estimate < 500 OR moeReliability low AND
estimate < 2000 (kept in a separate `markets-audit.json` for transparency, à la
v1's held-out rows). Never silently discard; counts of held-out rows go in meta.

## 2. anchors — community presence POIs (snapshot)

- Source: OpenStreetMap Overpass API (v1's approach, proven). Categories:
  - temples: `amenity=place_of_worship` + `religion=hindu` (+ jain, sikh
    separately labeled)
  - groceries: shop=supermarket/convenience/grocery with Indian/South Asian
    name or cuisine/origin tags; port v1's false-positive lessons: exclude
    generic matches, locality-name leakage (e.g. "Madras, OR"), non-South-Asian
    category leakage
  - cricket: `leisure=pitch` + `sport=cricket`, cricket clubs
  - theaters showing Indian cinema: seed from v1's `cinema-*.json` artifacts
    (port, relabel provenance and dates honestly)
- QA pipeline stage with an explicit rules file (`pipeline/anchors/qa-rules.mjs`)
  listing exclusion patterns, so the filter is reviewable.
- Each anchor: `{ id, kind, name, lat, lng, marketGeoid, osmUrl, tags,
  qaFlags: string[] }`. Keep flagged-but-included anchors visible for audit.
- Strip direct-contact tags such as email, phone, fax, mobile, and
  `contact:*` before committing artifacts. They are not required for the
  market-presence use case.
- Output: one national `anchors.json` + per-market rollups merged into markets.

## 3. scoring — market score and tiers (derived)

Pure function in `lib/scoring/`, unit-tested, weights in one exported constant.

```
score = 0.35 * log-scaled AI population
      + 0.20 * multipleOfUS (capped)
      + 0.20 * anchors per 10k AI (capped)
      + 0.15 * employment proxy density (LCA filings per 10k AI, capped)
      + 0.10 * student presence (scaled)
```

Tiers (names are user-facing; keep v2's plain language, not v1's "registry/leads"):
- **Tier 1 — Launch-planning markets:** score threshold + moeReliability high +
  anchors ≥ 5. Expect ~15-25 markets.
- **Tier 2 — Growth markets:** solid score, medium reliability or thinner anchors.
- **Tier 3 — Discovery candidates:** signal exists, needs verification before spend.
- **Tier 4 — Audit hold:** weak/noisy; visible only when "show audit inventory"
  filter is on.

Weights and thresholds must be tuned so that the v1 hand-audited 29 metros land
sensibly (San Jose/SF/NYC/Dallas Tier 1; Indianapolis/Greenwood type markets
Tier 3). Write a snapshot test asserting the demo markets' tiers.

## 4. employment — LCA workforce proxy (grounded)

- Source: DOL OFLC LCA disclosure FY2026 or the newest reviewed release.
- Aggregate ONLY: filings count and top-10 employers per CBSA (worksite city →
  CBSA mapping via a city/county→CBSA crosswalk; HUD or Census delineation file).
- Mandatory caveat (rendered in UI wherever this appears): LCA certification is
  employer filing intent, not USCIS approval, headcount, nationality, or
  individual location proof. Language: "employer/workforce proxy".

## 5. students — SEVIS (grounded)

- Source: SEVIS by the Numbers and the studyinthestates.dhs.gov data hub.
  India active students by state; campus-level
  where available via College Scorecard joins (v1 did this; port the method).
- Rolled into markets as `students.activeIndianStudents` (state-level allocation
  labeled as such in caveats).

## 6. competitors — profiles + rates + ads + reviews

Competitor set (v2.1): Xpat itself as the reference row, plus Remitly, Wise,
Xoom (PayPal), Western Union, Aspora, and Crobo. Aspora and Crobo are tracked
for positioning, offer evidence, reviews, and connector-needed rate rows until a
public unauthenticated quote path is verified.

### 6a. rates — live FX comparison (live + snapshot fallback)
- Runtime route `/api/fx` (01-ARCHITECTURE.md §5).
- Pipeline twin: `pipeline/competitors/rates.mjs` can capture a snapshot into
  `data/artifacts/fx-snapshots.json` (rolling 90 days) so the page can chart a
  rate-margin trend over time and the runtime route has a fallback. Automatic
  accumulation is paused. Refreshes are manual via `node pipeline/run.mjs fx`
  on a feature branch and use the normal reviewed PR path.
- Per provider record: `{ provider, quotedRate, feeUSD, receiveAmountFor1000USD,
  effectiveMarginPctVsMid, method: 'api'|'page'|'manual', sourceUrl, capturedAt }`.
  Runtime `/api/fx?amount=` rows may also include `sendAmountUSD` so every
  provider row represents the same selected send amount while the committed
  snapshot artifact remains the $1,000 baseline.
- Manual Xpat overlay: `data/curation/fx-manual-quotes.json` may fill an Xpat
  public-page quote with `{ provider, quotedRate, feeUSD,
  receiveAmountFor1000USD, method: 'manual', sourceUrl, capturedAt }`. Leaving
  any numeric field null keeps the connector-needed state.
- If a provider does not expose a public machine-readable path for a complete
  quote row, emit a connector-needed row with a caveat rather than estimating a
  rate. The Aspora and Crobo round 2 rows use the exact caveat
  "No public machine-readable quote path found."
- The Competitors page derives a generic "what changed" strip from
  `fx-snapshots.json` by comparing the latest quoted-rate snapshot with the
  previous capture day. Change items use `{ date, provider, whatChanged,
  evidenceLink }` so later positioning or offer diffs can reuse the same shape.

### 6b. ads — public ad evidence (snapshot)
- Meta Ad Library: for US non-political ads the API is restricted, so sweeps are
  Playwright-scripted against the public Ad Library UI: search each competitor
  page, capture ad cards as screenshots + extracted text + adLibraryUrl + dates.
  Low frequency (weekly max), rate-limited, respect ToS posture: public pages
  only, no login.
- Google Ads Transparency Center: same pattern, per advertiser.
- Record: `{ competitor, platform, headline?, bodyText?, mediaType, placement?,
  screenshotRawPath?, screenshotPath?, sourceUrl, firstSeen?, lastShown?,
  capturedAt, themes: string[] }`.
- One row equals one parseable public ad card or creative, capped at 6 per
  competitor per source sweep. Meta rows use Library IDs. Google rows use
  Transparency Center creative IDs.
- Screenshots go to `data/raw/ads/{competitor}/`; the same capture is copied to
  `public/evidence/ads/{competitor}/` for UI display. Extracted display text is
  normalized for the copy contract, while the screenshot and library URL preserve
  the exact public creative.
- V1 June 17, 2026 port: `pipeline/competitors/port-v1-ad-captures.mjs` reads
  `data/raw/v1-port/competitor-observations.json` and points at copied PNGs in
  `public/evidence/ads/june-2026/`. The port preserves original `capturedAt`
  values. Four v1 `publicAdExamples` rows have source metadata but no committed
  PNG, so they remain metadata-only snapshot records and do not count as
  image-backed captures.
- Claim boundary (render everywhere ads appear): public creative proves visible
  footprint, never spend, targeting, delivery, or performance.

### 6b.1. xpat-footprint - owned public footprint (snapshot, ported)
- Source: v1 `data/grounded/competitor-observations.json`, observations
  `obs_007` and `obs_008`, copied into `data/raw/v1-port/`.
- Output artifact: `data/artifacts/xpat-footprint.json`.
- Record: `{ id, title, summary, sourcePlatform, sourceUrl, capturedAt,
  recommendedUse, accessMethod, confidence }`.
- Capture dates remain the original v1 dates. The port script must not restamp
  observation rows as fresh.
- Claim boundary: public footprint visibility proves advertiser and creative
  presence only. It does not prove targeting, delivery, customer outcomes, or
  channel efficiency.

### 6c. reviews — app-store review mining (snapshot)
- iOS: iTunes customer-reviews RSS per app id (verify endpoint format current).
- Android: `google-play-scraper` npm package.
- Pull most-recent ~500 per app per store. Theme extraction v2.0 is a transparent
  keyword-rule classifier (`pipeline/competitors/review-themes.mjs` with a visible
  rules table: speed, fees, rates, KYC friction, trust/safety, support, app bugs).
  Each theme count links to example reviews (text, rating, date, store).
- Output: `{ competitor, store, sampleSize, window: {from, to},
  themes: [{ theme, count, sharePct, examples: ReviewExcerpt[] }] }`.
- LLM-written summaries are phase 2; v2.0 ships rule-based counts + real excerpts.
- Delta rankings require a combined provider review floor of at least 100
  reviews. Providers below that floor may appear as columns and cards, but are
  excluded from largest-gap ranking until the sample grows.
- `data/artifacts/switch-moments.json` is emitted by the review-theme pipeline
  from the full public review corpus before theme examples are truncated. It uses
  a transparent switch-intent rule set. Fields:
  `{ provider, store, reviewDate, theme, matchedPattern, excerpt, id }`.
- Switch-moment caveat: public review excerpts showing switch intent are presence
  evidence for messaging tests, not conversion data. If the rule pass finds no
  real matches, the UI shows zero rather than padded examples.

### 6d. positioning — offer/page snapshots (snapshot + curated view)
- Scripted capture of each competitor's US→India landing page: headline, intro
  offer, fee claim, speed claim, screenshotPath, capturedAt. Weekly max.
- Curated matrix: `data/curation/positioning-curated.json` is a hand-reviewed
  view over `data/artifacts/competitor-positioning.json`. It keeps four fields
  per provider: intro offer, fee claim, speed claim, and differentiator. Cells
  preserve the source URL and raw screenshot path from `data/raw/positioning/`.
  The curated file may clean extraction noise such as navigation text or
  disclaimer fragments, but it must not invent a claim absent from the public
  page evidence.

### 6e. offers - dated public offer tracker (ported snapshot)
- Source: v1 `data/grounded/competitors.json`, `signals[]`, copied into
  `data/raw/v1-port/competitors.json`.
- Output artifact: `data/artifacts/competitor-offers.json`.
- Record: `{ id, provider, offer, observation, sourceUrl, evidenceLabel,
  capturedAt, priority }`.
- Capture dates remain the original v1 dates. The port script must not restamp
  rows as fresh evidence.
- Header caveat: "Dated public offer evidence. Intro offers change frequently;
  re-verify before citing in a meeting."
- Claim boundary: offer evidence proves dated public copy or observations only.
  It does not prove spend, targeting, delivery, conversion, or performance.

## 7. community — threads, creators, trends

### 7a. threads (snapshot)
- Source: Reddit public JSON (`/r/<sub>/search.json` and listing endpoints, proper
  User-Agent, respect rate limits). Subreddits: nri, h1b, immigration, ABCDesis,
  IndiaInvestments, personalfinance (india-related searches), india, bangalore/
  hyderabad/chennai (US-remittance queries). Query set versioned in
  `pipeline/community/queries.json` (remit terms, competitor names, "send money
  to india", KYC/transfer-failure complaints).
- Record: `{ id, title, url, subreddit, publishedAt, capturedAt, score,
  numComments, matchedQueries[], themes[], recency: 'recent'|'historical' }`
  (recent = published within 60 days of capture).
- v1 port path: copy `data/grounded/community.json` into
  `data/raw/v1-port/community.json`, then run `node pipeline/run.mjs
  signals-port`. The port emits `data/artifacts/community-threads.json`.
- Ported rows preserve original `capturedAt`. `publishedAt` may be derived from
  the v1 posted-age label only when the committed source does not include an
  absolute publish timestamp; such rows include `publishedAtPrecision`.
- Saved search queues and non-thread surfaces are preserved under
  `monitorQueues` and are not counted as thread evidence.
- Quora/forums: skip in v2.0 (no reliable public API; backlog).

### 7b. creators (snapshot)
- Source: YouTube Data API v3 (key in local .env). Seed queries: NRI finance,
  send money to India, H1B finance, Indian expat USA, remittance comparison,
  Telugu/Tamil/Hindi personal finance USA.
- Record: `{ channelId, name, url, subscriberCount, recentRelevantVideos:
  [{title, url, publishedAt, views}], audienceFitNote, capturedAt }`.
  `audienceFitNote` is hand-reviewed text in a curated overlay file; the pipeline
  merges it. No invented "influencer pricing" anywhere.
- v1 port path: copy `data/grounded/competitors.json` into
  `data/raw/v1-port/competitors.json`, then run `node pipeline/run.mjs
  signals-port`. The port emits `data/artifacts/creators.json`.
- Ported creator record: `{ id, rank, handle, platform, audienceLang,
  currentSponsor, followerTier, fitScore, fitNote, link, capturedAt,
  recencyLabel, evidence, group }`.
- Groups are `evidence-linked` for dated proof links and `leads-to-verify` for
  older profile-only leads. The evidence string is preserved verbatim from v1.
- Sponsor visibility means observed public sponsorship or link context, never
  creator pricing, delivery, or campaign results.

### 7c. trends (snapshot)
- Google Trends via an unofficial client is brittle; v2.0 scope: capture interest-
  over-time and interest-by-state for a small fixed query set monthly, store with
  method noted, and label clearly. If tooling proves too flaky, ship the section
  as `connector-needed` with a manual-upload path instead. Do not fake it.

### 7d. geo-visibility - AI answer visibility (snapshot/manual)
- Output artifact: `data/artifacts/geo-visibility.json`.
- Source method: monthly manual capture, documented in
  `docs/geo-capture-protocol.md`.
- Assistants: ChatGPT, Gemini, Claude, Perplexity.
- Query list is maintained in the artifact: `best way to send money from USA to
  India`, `cheapest USD to INR transfer`, `best remittance app for NRIs`,
  `Wise vs Remitly for India`, and `is Xpat money transfer legit`.
- Cell schema: `{ query, assistant, status, providersNamed[], xpatMentioned,
  capturedAt, evidenceScreenshotPath, method }`, where method is
  `manual capture`. Pending cells use `status: 'capture-pending'`, null date and
  screenshot path, and an empty provider array.
- Screenshots live under `data/raw/geo/`. Commit only screenshots that correspond
  to captured answer cells for this evidence round.
- UI summary must compute captured answers, Xpat mentions, and competitor
  presence from the artifact. Never hardcode the summary.

## 8. cinema — Indian cinema footprint (grounded/snapshot, ported)

Port v1's `cinema-*.json` (blockbuster release theater footprints, e.g. Pushpa 2)
with provenance re-stamped and dates preserved. Cultural corroboration only;
caveat: proves community presence around releases, not remittance demand.

## 9. playbook inputs — personas, channels, surfaces (derived + curated)

- `personas.json`: 6-8 personas (H1B mid-career professional, family remitter,
  graduate student/OPT, first-time remitter, returning-NRI investor, tax-season
  remitter, competitor-switcher). Each: signals that indicate it, evidence
  requirements, message angles, compliance notes. Persona-market fit scoring =
  pure function over market features (students share, LCA density, income,
  anchors mix), unit-tested; the score IS a recommendation with confidence, never
  a hard label (v1 lesson).
- `channels.json`: channel playbook cards (Google Search, Meta, YouTube creators,
  creator sponsorship, grocery retail media, temple/community sponsorship,
  cricket sponsorship, theater lobby, campus). Each: when it fits, evidence to
  check, benchmark reference market, measurement path.
- `creator-sponsor-examples.json`: curated v1 sponsor examples for the
  Playbook creator channel. Preserve original evidence dates. These rows prove
  observable sponsor/content surfaces only.
- `corridor-context.json`: derived context for the Playbook header. Source
  inputs: World Bank India personal remittances received, RBI US-source share,
  and `markets.summary.nationalAsianIndian`. Per-market method: allocate the
  US-to-India corridor estimate by market share of national Asian Indian
  population. Display values rounded aggressively and labeled as derived
  order-of-magnitude estimates.
- `fx-history.json`: 12-month USD/INR history fetched from Frankfurter's
  historical time-series endpoint. Historical context only. No forecasts.
- `data/curation/seasonal-calendar.json`: curated remittance-relevant moments
  with date windows, play suggestion, and source notes. Treat as planning
  calendar context, not demand prediction.
- Experiment plan generator: template (from v1's Segment Action Pack shape) filled
  from market + persona + channel data, passed through the claim-contract
  validator. Budget bands labeled "suggested test budget, estimate".
- Counter-move generator: select a real review-frequency theme share from
  `review-themes.json`, attach the source link, and generate observed weakness,
  counter-message hypothesis, test channel, success threshold, and kill
  criterion. These are review-frequency observations, not competitor
  performance claims.
- Target-zone generator: derive per-market sub-metro zones from `anchors.json`.
  Group temples, Indian groceries, cricket grounds, and theaters by OSM
  `addr:city`; places without a city tag can join the nearest existing named
  group by coordinates, but the app must not invent a locality name. Named groups
  must also pass the actionable-locality guard before they can become copyable ad
  geos: state evidence must match the selected market, or the locality must be
  an exact token from the CBSA name. Rank zones by place count weighted by kind
  diversity. Zone cards render place mix, persona evidence phrased as community
  presence evidence, and nearest source links.
- Geo-pack generator: creates copy-ready Google Ads locality targets, Meta
  locality radius suggestions, YouTube/creator language signals from the cinema
  language mix, and employer campus-area hints labeled as employer/workforce
  proxy only. These strings are setup aids, not audience identity or performance
  claims.
- Content-topic generator: derives market-specific topics and reply angles from
  community threads, monitor queues, review-frequency themes, target zones, and
  creator sponsor examples. Each topic names source evidence, owner/channel,
  copy-ready asset, next experiment, and boundary copy. These are content test
  ideas, not performance forecasts.
- Platform-routing matrix: derives persona by platform fit from existing persona
  scores and channel fit weights. Meta cells must cite the team's reported
  targeting constraint and frame geography plus creative as the levers, not
  interest targeting.
- Competitor visibility: public ad-library rows can show creative context only.
  Per-zone competitive pressure requires Xpat's own Google Ads Auction Insights
  export segmented by geo.

### 9a. measurement proof gate CSV

The client-side importer accepts one exported CSV and never persists it
server-side. Header synonyms:
- market: `market_geoid` or `geo_name` + `state`
- measurement: `spend` or `cost`, `conversions`, `first_transfers`, `clicks`,
  `impressions`. `conversions` are context only unless the export defines them
  as first transfers.
- context: `platform`, `campaign`, `baseline_group`

Rules:
- Minimum 10 first transfers before any per-market coverage row is trusted.
- Unmapped rows are displayed and excluded from market aggregates.
- Baseline rows are separated when `baseline_group` says baseline or control.
- Rows marked `sample_data` are separated from Xpat-owned proof status and
  market aggregates. They may power a clearly labeled sample-demo proof state and
  visible sample mapping preview only.
- No campaign-name guessing to infer geography. Geography comes only from
  `market_geoid` or exact `geo_name` + `state` matching.
- Status labels are data sufficiency only: confirmed gap, already covered, or
  insufficient data. They are not performance judgments.
- The committed sample CSV is labeled sample data for demo. It uses demo rows
  that match the parser schema and cross the 10-first-transfer floor for San
  Jose, but those rows are excluded from Xpat-owned proof status, cost, and
  coverage aggregates.

## 10. Refresh cadences (document in each meta, show in UI footer)

| Family | Cadence |
|---|---|
| markets, employment, students, cinema | Per ACS/DOL/SEVIS release (quarterly-ish) |
| anchors | Monthly |
| ads, positioning, reviews, threads, creators | Weekly script, run manually |
| fx snapshots | Manual reviewed refresh; `/api/fx` live hourly |
