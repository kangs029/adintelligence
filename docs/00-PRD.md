# 00: Product Requirements for Xpat Audience Intelligence OS v2

Status: implemented prototype, transferred for continued team development.
Product owner and maintainer assignments belong to the receiving team.

## 1. One-paragraph pitch

Xpat (formerly Remit2Any) sends money from the USA to India. Its ideal customers,
US-based NRIs, are a small, high-value audience hidden inside broad US digital
traffic, so paid acquisition is expensive and noisy. This product is a 4-page
intelligence console that answers, with real public data and honest labels:
**where** the audience is (Market Map), **who** is competing for it and how
(Competitors), **what** the community is actually saying (Signals), and **what
Xpat should do about it** in a specific market (Playbook).

## 2. What this product must prove

To Xpat's CEO and marketing team:

1. The audience can be located with public data at metro and sub-metro level,
   with evidence you can click through to the source.
2. Competitor pressure is observable: live rates, public ads, review pain themes.
3. Community demand is observable and dated: real threads, real creators.
4. Every observation converts into a concrete, testable acquisition action with
   an explicit measurement path.
5. The product separates evidence from assumption rigorously. Its honesty is
   part of the value proposition.

## 3. What changed from the previous prototype

| v1 | v2 |
|---|---|
| 5 overlapping tabs (Audience, Competitor, Community, Targeting, OS) | 4 pages with a story arc: Map → Competitors → Signals → Playbook |
| Static d3/us-atlas SVG map | Full-bleed interactive MapLibre GL map |
| 29 audited metros + 573 loosely-filtered discovery leads | All ~900 CBSAs scored from Census API with explicit quality tiers |
| Competitor/community data mostly hand-curated June snapshots | Scripted, repeatable sweeps: ad libraries, app reviews, Reddit, YouTube, live FX rates |
| Provenance labels in copy | Provenance chips as a first-class UI primitive on every card |
| AI market briefs in the previous prototype | Streamed and pre-generated briefs grounded in committed artifacts |
| One long page per tab | Dense operator-console layouts per the mockup |

## 4. The 4 pages

1. **Market Map** (`/`) — interactive US map of Asian Indian audience density and
   community anchors. Filter rail (tier, state, minimum population, anchor
   types, presets).
   Clicking a market opens an evidence drawer: population + MOE, concentration
   multiple, anchors with OSM links, employment proxy, students, cinema footprint.
2. **Competitors** (`/competitors`) — live USD→INR rate comparison table (Xpat vs
   Remitly, Wise, Xoom, Western Union), dated public-ad evidence gallery, app-store
   review themes per competitor, positioning/offer snapshots.
3. **Signals** (`/signals`) — community threads (recent vs historical, both
   publishedAt and capturedAt shown), creator roster with audience-fit notes,
   review pain themes across the category, search-demand trends.
4. **Playbook** (`/playbook`) — select a market → full dossier: scored personas,
   channel recommendations benchmarked against reference markets, offline
   activation surfaces (grocery retail media, temple/community sponsorship,
   cricket, theater lobby, creators), experiment plan with budget band and success
   thresholds, measurement spec (UTM/MMP/event map), and the explicit "data we
   need from Xpat" ask. Grounded AI briefs and evidence chat are available when
   AI Gateway credentials are configured.

## 5. The claim contract (enforced, not decorative)

Public data supports **hypotheses about where to test**, never performance claims.
The following may NEVER appear as an assertion derived from public data: Xpat or
competitor spend, CAC, CPA, conversion rate, KYC completion, first transfer,
repeat transfer, LTV, ROI, delivery of a specific ad in a specific geo, individual
identity or visa status of any person.

Implementation requirement: recommendation and dossier objects pass through a
claim-contract validator (pure function + unit tests) that rejects/strips banned
claim types. This mirrors v1's hard-won contract; port the concept, not the code.

Language rules:
- H-1B/LCA data is an "employer/workforce proxy", never individual targeting.
- Anchors (temples, groceries, cricket, theaters) are "community presence
  evidence", not customer counts.
- Every estimate is labeled estimated; every benchmark names its reference market.
- No em dashes in user-facing copy. Use commas, periods, or rewrite the sentence.

## 6. Provenance model (first-class)

Five provenance classes, each with a fixed chip style (03-DESIGN-SYSTEM.md §7):

| Class | Meaning | Example |
|---|---|---|
| `live` | Fetched at request time or < 24h cache | FX rates |
| `snapshot` | Scripted sweep with capturedAt date | Reddit threads, reviews, ads |
| `grounded` | Stable public dataset with release version | Census ACS 2024 5yr, LCA FY2026 |
| `derived` | Computed by our pipeline from the above | Market scores, tiers, themes |
| `connector-needed` | Requires Xpat-owned data; intentionally empty | CAC, funnel, spend |

Every artifact file and every UI card carries exactly one class. `connector-needed`
states render as designed empty states with the schema of what's missing, never as
invented numbers.

## 7. Users and demo context

Primary: marketing and growth operators evaluating market and competitor
evidence. Secondary: product and data maintainers assessing what owned exports
are needed to move from public evidence to measurement. The primary demo
environment is a desktop browser, screen-shared or projected. Mobile must not
break, but desktop remains the optimized surface.

## 8. Success criteria

- CEO can click any number and reach a source link or a labeled methodology note.
- The FX rate table shows genuinely live data during a demo.
- A full Playbook dossier for a demo market (San Jose, Dallas, Detroit,
  Indianapolis) generates zero claim-contract violations.
- Lighthouse performance ≥ 85 on `/` with the map; no console errors.
- All ingest scripts are re-runnable with one command each and produce
  deterministic, diffable artifacts.

## 9. Out of scope (v2.0)

- Real attribution, ad-account writes, autonomous outreach, production
  authentication, multi-tenant operation, private-group scraping,
  individual-level profiling, and CRM functionality.

## 10. Compliance guardrails

This is a capability prototype backed primarily by public and curated evidence.
Data collection respects robots.txt, rate limits, and source terms. Ad-library
sweeps are low-frequency and store only dated public evidence. Login-walled
scraping is out of scope. Customer-identifiable or regulated data must not be
ingested without a reviewed identity, authorization, audit, and retention model.
