# 01: Architecture

## 1. Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router, TypeScript strict | Verify current APIs at nextjs.org/docs before coding; do not code from memory |
| Styling | Tailwind CSS v4 + shadcn/ui | Tokens defined in 03-DESIGN-SYSTEM.md, wired via CSS custom properties |
| Map | MapLibre GL JS | Basemap: OpenFreeMap vector tiles (free, no key, production-permitted; verify at openfreemap.org). Custom dark style to match design tokens. Fallback if OpenFreeMap is unavailable: Protomaps PMTiles hosted on Vercel Blob |
| Charts | Recharts | Colors/marks per 03-DESIGN-SYSTEM.md §8; run the palette validator |
| Fonts | Geist Sans + Geist Mono | Via `geist` package |
| Icons | lucide-react | |
| Data (build) | Versioned JSON artifacts in `data/artifacts/`, committed | Typed loaders in `lib/data/` |
| Data (runtime) | Route handlers | Live FX, shared access, grounded brief generation, and read-only evidence chat |
| Pipeline | Node scripts (`pipeline/`), Python only where a library forces it | Never deployed; excluded via `.vercelignore` |
| Deploy | Vercel or a compatible Next.js host | The receiving team owns its project and credentials |
| Tests | Vitest for lib/pipeline units; Playwright smoke for the four core routes plus Sources | |

## 2. Repo layout

```
xpat-os/
  app/
    page.tsx                 # Market Map
    competitors/page.tsx
    signals/page.tsx
    playbook/page.tsx
    sources/page.tsx
    api/access/route.ts      # shared-password submission
    api/fx/route.ts          # live FX with snapshot fallback
    api/playbook/brief/      # grounded streamed market brief
    api/evidence/            # read-only evidence chat
    layout.tsx               # shell: top nav, provenance legend, footer
  components/
    shell/                   # TopNav, PageHeader, ProvenanceChip, SourceLink
    map/                     # MapCanvas, FilterRail, MarketDrawer, LayerToggle
    competitors/             # RateTable, AdEvidenceCard, ReviewThemes, CompetitorCard
    signals/                 # ThreadCard, CreatorCard, TrendPanel, RecencySplit
    playbook/                # MarketPicker, PersonaCard, ChannelPlan, ExperimentCard,
                             # MeasurementSpec, DataAskPanel
    charts/                  # thin Recharts wrappers with system tokens baked in
  lib/
    data/                    # typed artifact loaders (one per artifact family)
    scoring/                 # market scoring + tiering (pure, unit-tested)
    claims/                  # claim-contract validator (pure, unit-tested)
    format.ts
    types.ts                 # all artifact + domain types, single file, exported
  pipeline/
    census/                  # fetch + normalize ACS
    anchors/                 # Overpass sweeps + QA filters
    employment/              # LCA xlsx -> aggregates
    students/                # SEVIS
    cinema/                  # port of v1 cinema layer
    competitors/             # ad sweeps, review mining, rate snapshots
    community/               # reddit, youtube, trends
    lib/                     # shared: provenance stamping, http, cache, geo
    run.mjs                  # orchestrator: `node pipeline/run.mjs [family]`
  data/
    raw/                     # downloads, screenshots. gitignored + vercelignored
    artifacts/               # committed derived JSON. THE app data.
  docs/                      # this doc pack
  mockups/                   # HTML design reference
  AGENTS.md
```

## 3. Data flow

```
public sources
  -> pipeline/<family>/  (fetch, normalize, QA, score)
  -> data/artifacts/<family>.json     (provenance-stamped, versioned, committed)
  -> lib/data/<family>.ts             (typed loader, zod-parsed at build)
  -> server components render         (pages are RSC-first; client components only
                                       for map, filters, drawers, charts)
runtime exceptions:
  /api/fx -> provider quote sources -> cache -> RateTable
  /api/playbook/brief -> committed dossier facts -> AI Gateway -> sanitized stream
  /api/evidence/* -> read-only artifact tools -> AI Gateway -> cited response
```

Rules:
- Artifacts are **diffable**: stable key order, sorted arrays, ISO dates. A re-run
  with unchanged source data produces an identical file.
- Every artifact top-level: `{ meta: { family, version, generatedAt, provenance,
  source, method, refreshCadence, caveats[] }, data: ... }`.
- Loaders validate with zod and fail the build loudly on schema drift.
- `data/raw/` can be large and does not ship. Obtain raw inputs from the
  authoritative public source or from an approved, sanitized handoff bundle.
  Never substitute an unverified local file.

## 4. Map architecture

- MapLibre GL with a custom dark style (colors from design tokens).
- Two data layers, both from committed GeoJSON artifacts:
  1. **Markets layer**: one feature per CBSA, graduated circles sized by Asian
     Indian population, colored by tier (see 02-DATA-SPEC.md §3 tiers). Cluster at
     low zoom is NOT needed (~900 points max, use zoom-based radius scaling).
  2. **Anchors layer**: temples/groceries/cricket/theaters as small dots, visible
     at zoom ≥ 8 or when a market is selected (filtered to selected market radius).
- Interactions: hover = compact tooltip (name, tier, AI population, multiple-of-US);
  click = MarketDrawer slides in from right with full evidence; drawer state in
  URL (`?market=<geoid>`) so views are shareable.
- The FilterRail filters the markets layer client-side via MapLibre setFilter.
- Performance: markets GeoJSON must stay < 1.5MB; anchors load lazily per state
  or as a second fetch after first paint.

## 5. Runtime routes

### `/api/fx`

- Returns `{ midMarket: {rate, source, asOf}, providers: [{name, rate, fee,
  receiveAmountFor1000USD, source, asOf, method}] }` for USD→INR.
- Mid-market: a free daily/hourly FX API (implementer verifies current best free
  option, e.g. frankfurter.app ECB or open.er-api.com; pick one with INR and no
  key, document choice).
- Provider quotes: Wise's public comparison endpoint historically exposes
  competitor receive-amounts; implementer must verify current availability and
  terms. Any provider without a clean public quote path falls back to the latest
  pipeline snapshot with its capturedAt shown. NEVER present a stale quote as live.
- Cache: 1 hour (Vercel data cache / route revalidate). On total failure, serve
  committed snapshot artifact with `provenance: snapshot` so the table degrades
  honestly (chip flips from live to snapshot).

### `/api/access`

- Accepts the shared-password form only.
- Sets an HttpOnly, host-scoped cookie containing a signed expiry and HMAC.
- Never stores or returns the submitted password.
- Sanitizes redirect targets to same-origin relative paths.

### Grounded AI routes

- Market briefs and evidence chat use committed artifacts as the only fact
  source.
- Generated output is sanitized against the claim contract.
- Missing AI credentials produce a designed connector-needed response.
- Evidence tools are read-only and cannot modify artifacts or external systems.

## 6. Error handling and empty states

- Every page renders fully with zero JS (except map/charts placeholders): RSC-first.
- Missing artifact family = build error, not silent empty UI.
- `connector-needed` sections are designed states (03-DESIGN-SYSTEM.md §9), showing
  the exact export schema Xpat must provide.
- Map tile failure: page still shows filter rail + market list fallback (a simple
  ranked list replaces the canvas, with a retry).

## 7. Environments and secrets

- `XPAT_ACCESS_PASSWORD` is required for local and deployed application access.
  Missing configuration fails closed.
- Vercel AI Gateway can use platform OIDC. Local development can use
  `AI_GATEWAY_API_KEY`.
- `CENSUS_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and
  `YOUTUBE_API_KEY` are optional pipeline-only connectors.
- `CRON_SECRET` and `FX_SNAPSHOT_WEBHOOK_URL` are optional and only support the
  unscheduled FX snapshot diagnostic route.
- All values live in ignored local environment files or deployment-provider
  environment settings. Never use `NEXT_PUBLIC_` for secrets.

## 8. Git workflow

Use `feat/`, `fix/`, or `chore/` branches and open pull requests to `main`.
Require green CI and at least one reviewer before merge. Keep `main` deployable
and do not place machine-specific or personal workflow instructions in the repo.
