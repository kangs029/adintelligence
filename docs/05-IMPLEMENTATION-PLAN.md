# Xpat OS v2 Historical Implementation Plan

> This records the build sequence and acceptance gates used for the current
> prototype. Most phases are already implemented. New maintainers should use it
> as design history and regression context, not as an unchecked active backlog.
> Read `docs/00` through `04`, `docs/06-HANDOFF.md`, and the current code before
> deciding what work remains.

**Goal:** Build the 4-page Xpat Audience Intelligence OS v2 on real public data
with the doc pack as the source of truth.

**Architecture:** Static provenance-stamped JSON artifacts from re-runnable
pipeline scripts, RSC-first Next.js 16 app, MapLibre map, one live `/api/fx`
route. See `docs/01-ARCHITECTURE.md`.

**Tech stack:** Next.js 16 / TS strict / Tailwind v4 / shadcn/ui / MapLibre GL /
Recharts / Vitest / Playwright. Verify current APIs in official docs before use;
do not code from memory.

**Working rules (binding):**
- TDD for every `lib/` and `pipeline/` module: failing test → minimal code →
  pass → commit. UI components: build to mockup, then Playwright smoke.
- Branches `feat/<phase>-<task>`, PRs to main, green CI, and reviewer approval.
- Commit after every green task. No em dashes in any user-facing string
  (add the lint check in Phase 0 Task 3).
- If an external endpoint differs from the spec's expectation, STOP, document
  what you found in `docs/decisions.md`, adapt the contract minimally, continue.

---

## Phase 0 — Scaffold and guardrails

### Task 0.1: Repo + framework scaffold
Files: repo root (this folder becomes the app root).
- Repo is already a git repo with the doc pack committed on `main`; create
  branch `feat/scaffold`. Node LTS. `create-next-app`
  (App Router, TS, Tailwind v4, ESLint) INTO this folder, preserving `docs/`,
  `mockups/`, `README.md`, `AGENTS.md`.
- Add `.gitignore` (`data/raw/`, `.env*`) and `.vercelignore` (`data/raw/`,
  `pipeline/`, `mockups/`, `docs/`).
- Install: `maplibre-gl`, `recharts`, `geist`, `lucide-react`, `zod`, shadcn/ui
  init; dev: `vitest`, `@playwright/test`, `tsx`.
- Verify: `pnpm run dev` serves; `pnpm run build` passes. Commit.

### Task 0.2: Design tokens + app shell
Files: `app/globals.css`, `app/layout.tsx`, `components/shell/{TopNav,PageHeader,ProvenanceChip,SourceLink,StatTile}.tsx`.
- Implement every token from `docs/03-DESIGN-SYSTEM.md` §2-3 as CSS custom
  properties; wire Geist fonts; build the shell components to match the mockup's
  nav/header/chips exactly (all five chip classes).
- Static placeholder pages for the 4 routes with PageHeaders so nav works.
- Verify: visual diff against mockup nav/header; `pnpm run build`. Commit.

### Task 0.3: Guardrail tooling
Files: `scripts/check-copy.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml` (if repo goes to GitHub), `package.json` scripts.
- `check-copy.mjs`: scans `app/` + `components/` + `data/artifacts/` for em
  dashes (U+2014/U+2013 in user-facing strings) and for banned claim terms
  outside allowed contexts (list from `docs/00-PRD.md` §5); wire into
  `pnpm run lint:copy`. Write it test-first (Vitest, fixture strings).
- `pnpm test` = vitest; `pnpm run test:e2e` = playwright.
- Verify: seeded violation fails, clean tree passes. Commit.

---

## Phase 1 — Data foundation

### Task 1.1: Artifact meta + provenance core (binding contract)
Files: `lib/types.ts`, `lib/data/loader.ts`, `pipeline/lib/provenance.mjs`, tests.

```ts
// lib/types.ts (binding)
export type Provenance = 'live' | 'snapshot' | 'grounded' | 'derived' | 'connector-needed';
export interface ArtifactMeta {
  family: string; version: number; generatedAt: string; // ISO
  provenance: Provenance; source: string; method: string;
  refreshCadence: string; caveats: string[];
}
export interface Artifact<T> { meta: ArtifactMeta; data: T; }
```
- `loader.ts`: `loadArtifact<T>(family, schema: ZodType<T>): Artifact<T>` reads
  `data/artifacts/<family>.json`, validates meta + data, throws descriptive
  build error on drift. Deterministic-serialization helper in
  `pipeline/lib/provenance.mjs` (sorted keys, sorted arrays, ISO dates).
- TDD both. Commit.

### Task 1.2: Census markets pipeline
Files: `pipeline/census/*`, `data/artifacts/markets.json`, `lib/data/markets.ts`, tests.
- Implement `docs/02-DATA-SPEC.md` §1 exactly: all CBSAs, estimates + MOE,
  derived concentration fields, QA hold-outs to `markets-audit.json` with counts
  in meta. Verify table IDs against api.census.gov docs first; record the
  release used in meta.
- Unit tests on normalization + QA rules with fixture API responses.
- Sanity check in test: San Jose CBSA AI population within ±15% of 202,245
  (v1's audited ACS 2024 5yr value).
- Commit.

### Task 1.3: Scoring + tiers
Files: `lib/scoring/{score.ts,tiers.ts,weights.ts}`, tests.
- Implement `docs/02-DATA-SPEC.md` §3. Pure functions. Snapshot test asserting
  demo-market tiers (San Jose/SF/NYC/Dallas T1; Detroit T2; Indianapolis T3).
  Tune thresholds until the snapshot is sensible, then freeze. Commit.

### Task 1.4: Anchors pipeline (Overpass + QA)
Files: `pipeline/anchors/*` incl. `qa-rules.mjs`, `data/artifacts/anchors.json`, tests.
- Per spec §2. Port v1's false-positive exclusions into reviewable rules with
  fixture tests (Madras OR case, generic-grocery case, non-Hindu worship case).
- Merge per-market rollups into markets artifact (pipeline join stage). Commit.

### Task 1.5: Employment, students, cinema
Files: `pipeline/{employment,students,cinema}/*`, artifacts, tests.
- LCA xlsx → CBSA aggregates (crosswalk per spec §4; caveat strings in meta).
- SEVIS state-level → market allocation (labeled). Cinema: port reviewed
  snapshot JSON with re-stamped meta. Raw inputs come from an authoritative
  source or approved sanitized handoff bundle.
- Fixture-tested normalizers. Commit. **Phase 1 gate:** `node pipeline/run.mjs
  all` regenerates every artifact deterministically (run twice, `git diff`
  clean).

---

## Phase 2 — Market Map page

### Task 2.1: Map canvas + markets layer
Files: `components/map/{MapCanvas,MapLegend}.tsx`, `app/page.tsx`, `pipeline/geo/markets-geojson.mjs`.
- GeoJSON build step (< 1.5MB budget, test asserts size). MapLibre with
  OpenFreeMap dark style adapted to tokens (verify current style URL at
  openfreemap.org). Graduated tier-colored dots per `docs/04` Page 1. Hover
  tooltip. Commit.

### Task 2.2: FilterRail + KPI strip
Files: `components/map/FilterRail.tsx`, `components/shell/StatTile.tsx` usage.
- All filters from the spec incl. audit-inventory toggle and surprise-pockets
  preset (client-side setFilter). KPI tiles from markets meta. Commit.

### Task 2.3: MarketDrawer + deep link
Files: `components/map/MarketDrawer.tsx`, URL state handling.
- All 7 drawer sections with SourceLinks, caveat lines, cross-page CTAs;
  `?market=` sync both directions; anchors layer on selection. Playwright:
  deep-link test for San Jose. Commit. **Phase 2 gate:** Page 1 acceptance list
  in `docs/04` all green.

---

## Phase 3 — Competitors page

### Task 3.1: FX snapshot pipeline + /api/fx
Files: `pipeline/competitors/rates.mjs`, `app/api/fx/route.ts`, `lib/data/fx.ts`, tests.
- Verify current free mid-market API and provider quote paths BEFORE coding
  (spec §6a, architecture §5); document choices in `docs/decisions.md`. Route
  with 1h cache + honest snapshot fallback (chip class flips). TDD the fallback
  logic with mocked fetches. Commit.

### Task 3.2: Rate table + margin trend chart
Files: `components/competitors/{RateTable,MarginTrend}.tsx`, `app/competitors/page.tsx`.
- Table per spec; chart follows design-system §8 (fixed competitor colors,
  direct labels, one axis, crosshair tooltip). Run the dataviz palette validator
  against `#14161B` and record output in the PR. Commit.

### Task 3.3: Ads + positioning sweeps
Files: `pipeline/competitors/{ads-meta.mjs,ads-google.mjs,positioning.mjs}`, curation file, gallery components.
- Playwright sweeps per spec §6b/§6d (weekly-max, polite delays). Curated-subset
  flow into `public/evidence/ads/`. Gallery with boundary copy. First real sweep
  run happens here; commit artifacts. Commit.

### Task 3.4: Review mining + themes
Files: `pipeline/competitors/{reviews.mjs,review-themes.mjs}`, `components/competitors/ReviewThemes.tsx`, tests.
- Both stores per spec §6c; keyword-rule classifier TDD'd with fixture reviews;
  themes chart (single-hue) + excerpt expanders. Include Xpat's own apps.
  Commit. **Phase 3 gate:** Page 2 acceptance list green; live demo of /api/fx
  in dev.

---

## Phase 4 — Signals page

### Task 4.1: Reddit threads pipeline
Files: `pipeline/community/{threads.mjs,queries.json}`, artifact, tests.
- Spec §7a. Both dates stored; recency classifier TDD'd (60d boundary cases).
  First real sweep committed. Commit.

### Task 4.2: Creators pipeline
Files: `pipeline/community/creators.mjs`, curated overlay file, artifact.
- YouTube Data API per spec §7b (local key). Overlay merge for fit notes. Commit.

### Task 4.3: Signals page assembly
Files: `app/signals/page.tsx`, `components/signals/*`.
- Recent/Historical split UI, creator grid, category review-pain rollup chart,
  trends panel OR ConnectorNeeded per spec §7c reality check. Two-dates tooltip.
  Commit. **Phase 4 gate:** Page 3 acceptance green.

---

## Phase 5 — Playbook page

### Task 5.1: Claim-contract validator (binding contract)
Files: `lib/claims/{contract.ts,banned.ts}`, tests.

```ts
export interface ClaimViolation { path: string; term: string; rule: string; }
export function validateClaims(obj: unknown, context: 'dossier'|'copy'): ClaimViolation[];
```
- Encodes PRD §5 banned assertions (term list + context allowances, e.g. a
  connector-needed panel MAY name "CAC" as missing data). Extensive TDD: cases
  from v1's lessons (corridor evidence promoted to local claim, benchmark
  without reference market, estimate without label). Commit.

### Task 5.2: Personas + channel scoring
Files: `lib/scoring/personas.ts`, `data/artifacts/{personas,channels}.json`, tests.
- Spec §9. Fit scores with confidence + contribution breakdown (the "why").
  Snapshot tests for the 4 demo markets. Commit.

### Task 5.3: Dossier assembly + page
Files: `app/playbook/page.tsx`, `components/playbook/*`, `lib/playbook/dossier.ts`, tests.
- Dossier builder composes sections a-g from artifacts; every experiment card
  passes `validateClaims` in a build-time test; offline surfaces cite anchor
  ids. MarketPicker with pinned demo chips + `?market=` deep link. Commit.

### Task 5.4: Print stylesheet + leave-behind
Files: `app/playbook/print.css` (or CSS module), Playwright PDF check.
- Dossier prints clean 3-5 pages: hide nav/filters, page-break rules per
  section, chips render with labels. Commit. **Phase 5 gate:** Page 4
  acceptance green for all 4 demo markets.

---

## Phase 6 — Hardening + deploy

### Task 6.1: E2E + performance pass
- Playwright suite per `docs/04` cross-page acceptance. Lighthouse ≥ 85 on `/`
  (budget the map: lazy anchors, preconnect tiles). Fix findings. Commit.

### Task 6.2: Freshness footer + sources page
- Footer table from all artifact metas; `/sources` methodology page generated
  from the same metas (every family: source, method, cadence, caveats). Commit.

### Task 6.3: Vercel deploy
- Create a team-owned Vercel project. Configure `XPAT_ACCESS_PASSWORD` for
  Preview and Production before the first remote verification. QA the live URL
  against all page gates, then promote to production. Document the operational
  URL in the receiving team's system of record. Commit.

---

## Phase 7 — QA fixes + share-readiness

### Task 7.0: Local environment hygiene
- Kill stale local server on port 3015, rebuild current production output, and
  document the current local production-run command in README. Commit.

### Task 7.1: Share metadata
- Add per-page Metadata API titles/descriptions, OG/Twitter card tags,
  `opengraph-image` dark map hero, and favicon/touch-icon assets. Verify zero
  icon 404s. Commit.

### Task 7.2: Playbook market search
- Build searchable, tier-grouped, keyboard-navigable market picker that preserves
  pinned chips and `?market=` deep links. Playwright opens a non-pinned market
  through search. Commit.

### Task 7.3: Map console errors
- Reproduce and fix MapLibre promise/tile warnings, replace text-glyph anchor
  markers with non-glyph layers, and add console-clean Playwright assertions for
  `/` and `/?market=31000US41940`. Commit.

### Task 7.4: Positioning copy cleanup
- Add extraction cleanup rules and curated positioning overlay; re-run
  positioning sweep so competitor cards render coherent marketing copy with
  sources intact. Commit.

### Task 7.5: Data display fixes
- Dedupe cinema sample names, relabel OSM theater anchors vs release-window
  theaters, and add ECB weekday-reference microcopy to mid-market rate. Commit.

### Task 7.6: Mobile and layout polish
- Put mobile map before collapsible filters, compact map KPIs while drawer is
  open, fix form field id/name issues, separate tier 2/3 colors, and add light
  declutter for dense market clusters. Commit.

### Task 7.7: Guided demo mode
- Add a small `?tour=1` walkthrough toggle for the CEO sequence with keyboard
  arrows and one-line claim-clean captions. Keep it presentation-only and under
  the no-new-data/product-value boundary. Commit. **Phase 7 gate:** full local
  verification, production deploy from the merged branch, console/QA status
  reported per page.

---

## Self-review checklist for the implementer, end of each phase
1. Every spec requirement in the phase has a passing test or Playwright check.
2. `node pipeline/run.mjs all` is deterministic (run twice, git diff clean).
3. `pnpm run lint && pnpm run lint:copy && pnpm test && pnpm run build` all
   green.
4. UI matches mockup; deviations documented in the PR description.
5. No invented data anywhere: grep artifacts for provenance classes, confirm
   every UI number traces to an artifact or /api/fx.
