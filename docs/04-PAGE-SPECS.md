# 04 — Page Specifications

Four pages, one story arc: **where** (Map) → **against whom** (Competitors) →
**what people say** (Signals) → **what to do** (Playbook). Cross-links carry the
user along the arc. The mockup file shows each layout; this doc defines behavior,
states, and acceptance criteria.

Shared shell: TopNav with 4 tabs; footer with data-freshness table (every artifact
family + generatedAt + cadence) and the provenance legend.

---

## Page 1 — Market Map (`/`)

**Job:** show, in one glance, that the NRI/Asian Indian audience is locatable and
tiered, with click-through evidence.

### Layout
- Full-bleed MapLibre canvas under the nav; 260px FilterRail overlaid left;
  KPI strip overlaid top-right (4 stat tiles: qualified markets count, total
  AI population covered, community anchors mapped, data release label).
- MarketDrawer (420px) slides from right on market click; URL syncs
  `?market=<geoid>`.

### Map behavior
- Dots: radius = sqrt(AI population), color = tier token, hairline dark stroke.
  Hover: tooltip (name, tier label, AI pop, ×US multiple) + cursor pointer.
- Zoom ≥ 8 or market selected: anchors layer fades in (temples ▲, groceries ●,
  cricket ◆, theaters ■, 6px, muted color until hover).
- FilterRail: tier multi-select (default 1-3 on; tier 4 behind "show audit
  inventory" toggle), state combobox, min AI population slider defaulted to 0,
  anchor-type
  toggles, "surprise pockets" preset (tier 2-3 with multipleOfUS ≥ 3 outside
  the top-10 metros).
- Legend chip bottom-left: size = population, color = tier.

### MarketDrawer sections (in order)
1. Header: name, state, tier chip, score, GROUNDED chip with ACS release.
2. Population: AI estimate ± MOE, local share, ×US multiple, reliability badge.
3. Community anchors: counts by kind + per-10k density; expandable list, each
   with OSM SourceLink; qa-flagged items marked.
4. Employment proxy: LCA filings count, top employers list, mandatory caveat
   line ("employer/workforce proxy...").
5. Students: active Indian students (state-allocated, labeled).
6. Cinema footprint: theater count + example theaters (if data present).
7. Footer CTA row: "Open playbook for this market →" (goes to
   `/playbook?market=<geoid>#market-snapshot`), "View competitor pressure →".

### States
- Tile failure → ranked market list fallback + retry button.
- Tier 4 selected → drawer banner: "Audit hold: below evidence threshold, shown
  for transparency."

### Acceptance
- 60fps pan/zoom on M-series Mac; markets GeoJSON < 1.5MB; first paint < 2.5s.
- Deep link `?market=31000US41940` opens San Jose drawer directly.
- Every drawer number traces to a SourceLink or a methodology note.

---

## Page 2 — Competitors (`/competitors`)

**Job:** make competitor pressure concrete: live price, visible creative, real
review pain.

### Layout (top to bottom)
1. **PageHeader** + KPI strip: mid-market USD→INR (LIVE chip), best competitor
   rate, Xpat margin vs mid (if Xpat public quote available), ads captured this
   month, reviews mined.
2. **Rate table** (the demo moment): rows = Xpat, Remitly, Wise, Xoom, WU,
   Aspora, Crobo.
   Columns: quoted rate, fee for $1,000, receive amount for $1,000, effective
   margin vs mid-market, source, asOf. LIVE chip on the section; per-row chip
   flips to SNAPSHOT with date when a provider's live quote failed. Connector
   needed rows remain visible when no public machine-readable quote path exists.
   Below: a generic "what changed" strip compares the latest quoted-rate
   snapshot with the previous capture day and shows the current tracked-day
   count. Then show the 90-day margin trend line chart (one series per provider,
   fixed colors per §8 of the design system, direct-labeled ends, one axis).
3. **Competitor cards** (7, grid): logo/name, positioning line (from positioning
   snapshot with capturedAt), first-transfer offer, claims (speed/fee), links.
4. **Positioning claims matrix and offer tracker**: matrix cells show curated
   landing-page claims with evidence links. The offer tracker sits below the
   matrix and renders dated public offer evidence from the v1 port, preserving
   original capture dates and the intro-offer caveat.
5. **Ad evidence gallery**: filterable by platform and grouped by sweep date;
   each card = screenshot thumb when available, brand chip, extracted headline,
   platform, firstSeen?, capturedAt, adLibraryUrl/SourceLink, SNAPSHOT chip.
   Xpat owned rows carry "Xpat, owned benchmark"; MoneyGram, Instarem, Aspora,
   and Abound rows are allowed as "category context" evidence when backed by
   dated public captures. Section-level boundary line: "Public creative proves
   visible footprint. It does not prove spend, targeting, delivery, or
   performance."
6. **Review themes**: per competitor, horizontal bar chart of theme shares
   (single-hue sequential, since it's magnitude of one measure) + expandable
   real excerpts (text, rating stars, store, date). Xpat's own row included:
   seeing its own review pain lands well in demos. Largest-gap rankings require
   the review floor in `docs/02-DATA-SPEC.md`.

### States
- /api/fx total failure: table renders from latest snapshot, section chip =
  SNAPSHOT + banner "Live quotes unavailable, showing snapshot from {date}".
- No ads captured for a competitor: designed empty card "No public ads captured
  in window {range}", never blank.

### Acceptance
- Rate table populates live in < 1.5s or falls back visibly.
- Fixed competitor colors identical across table, trend chart, gallery filters.
- Offer tracker preserves original v1 capture dates.
- Zero claim-contract violations in rendered copy (unit test on section copy).

---

## Page 3 — Signals (`/signals`)

**Job:** prove the community is talking, observably and datably, and that
creators with the right audience exist.

### Layout
1. PageHeader + KPI strip: recent threads (60d), historical threads, creators
   identified, review excerpts mined, trends status.
2. **Community threads**: two-column split, "Recent (60d)" and "Historical",
   enforcing the v1 date-semantics fix. ThreadCard: title (links out), subreddit,
   publishedAt AND capturedAt (mono micro), score/comments, matched themes as
   tiny tags. Filter row: theme, subreddit, competitor mentioned.
3. **Creators**: grid of CreatorCard: name, subs (tabular), audience-fit note
   (curated), 2 recent relevant videos (linked, with publishedAt), SNAPSHOT chip.
   Boundary line: "Public channels with audience overlap. No outreach has
   occurred, no pricing is implied."
4. **Category review pain** (cross-competitor rollup of §6c themes): one chart,
   themes × share, with excerpts drawer.
5. **Search demand**: trends panel if data present; else ConnectorNeeded state
   with manual-upload schema (per data spec §7c honesty rule).

### Acceptance
- Every thread/creator card links to its live source.
- Recent/Historical split matches publishedAt logic (unit test).
- A "capturedAt ≠ publishedAt" tooltip explains the two dates (v1 lesson made
  visible).

---

## Page 4 — Playbook (`/playbook`)

**Job:** convert evidence into a testable plan for ONE market at a time. This
page merges v1's Targeting + OS tabs; the single-market dossier pattern won in
v1 demos, so it is the spine here.

### Layout
1. **MarketPicker** header: searchable combobox (tier-grouped) + the 4-6 pinned
   demo markets as quick chips. Deep-linked `?market=<geoid>`. Empty state
   (no market chosen): tier-1 grid with scores, "pick a market to build its
   playbook".
2. **Dossier** (for selected market), sections:
   a. **Market wedge**: one derived sentence explaining why Xpat can test here
      specifically, plus corridor context. The corridor figure uses World
      Bank India inbound remittances, RBI US-source share, and the market's
      share of national Asian Indian population. Label as derived and
      order-of-magnitude.
   b. **Market snapshot**: the drawer's key stats inline + link back to map.
   c. **Corridor plays, apply in every market**: exactly three market-independent
      plays, Brand transition watch, AI answer visibility content play, and
      National creator program. The label makes repetition intentional.
   d. **Personas** (scored): PersonaCard grid; each shows fit score with
      confidence label + "why" (feature contributions: students share, H-1B
      employer filing density, income, community-place mix), DERIVED chip.
      Recommendation language, not hard labels.
   e. **Channel plan**: recommended channels ranked for this market+persona,
      each with: why here (evidence links), benchmark reference market
      ("compare against Dallas playbook, not generic advice", the v1 benchmark
      lesson), suggested test budget band (labeled estimate), success metric.
      Creator sponsorship must render for Tier 1 demo markets with the
      /signals#creators dependency and observed Aspora/Crobo sponsor examples.
   f. **Where to point digital ads**: sub-metro target zones derived from the
      market's temples, Indian groceries, cricket grounds, and theaters, grouped
      by OSM `addr:city` and ranked by place count plus kind diversity.
      Untagged places can join the nearest named group, but no locality name is
      invented. Out-of-market named groups are excluded from copyable zones by
      the actionable-locality guard. The section includes a
      copy-ready geo pack, persona by platform routing, and competitor visibility
      context. Meta routing uses geography plus creative as the levers per the
      team's reported constraint. Competitor creative proves public footprint
      only; per-zone competitive pressure requires Xpat-owned Auction Insights by
      geo.
   g. **Content topics and reply angles**: market-specific topic cards derived
      from Signals threads, review-frequency themes, target zones, and creator
      sponsor evidence. Each card shows topic, reply angle, copy-ready asset,
      owner/channel, source evidence, next experiment, and boundary copy.
   h. **Offline surfaces**: the market's actual community places turned into activation
      ideas: named grocery stores (retail media/flyers), temples (community
      sponsorship), cricket leagues, theaters (lobby QR during releases). Each
      row cites the evidence it came from and expands to activation idea, asset
      needed, measurement convention, and honesty boundary. Theater rows render
      only where the cinema artifact has a market signal.
   i. **Referral amplification**: offline surfaces and creator promo codes are
      framed as referral-activation moments, with referral-code source tags as
      the owned measurement path.
   j. **Experiment plan**: 1-3 persona-channel experiments plus at least one
      counter-move experiment from review-frequency themes. Counter-move cards
      cite the competitor review share and carry a "counter-move" chip.
   k. **Creative angles**: up to 4 expandable templates filtered to personas
      scoring medium or higher. Each template shows headline, primary copy,
      format, funnel stage, targeting recipe, why, risk, CTA, measurement goal,
      and the grounding source link.
   l. **Rate timing and calendar**: 12-month USD/INR history from Frankfurter
      and the next 3 curated remittance-relevant calendar moments. Historical
      only, never predictions.
   m. **Measurement spec**: UTM conventions, MMP event map, analytics event
      names (install, signup, KYC start, KYC complete, first transfer, repeat
      transfer). Includes the client-side CSV proof gate. Parsing is local to
      the browser, sample CSV is labeled sample data for demo, unmapped rows are
      displayed but excluded from aggregates, sample_data rows may power a
      clearly labeled sample-demo status for the selected market, sample rows
      never enter Xpat-owned aggregates, and no campaign-name geo guessing is
      allowed.
   n. **What we need from Xpat**: five ConnectorNeeded export cards. Each card
      names the decision it unlocks, exact fields, and the manual CSV
      alternative. The fifth is Google Ads Auction Insights by geo.
   o. **From evidence to proof**: quiet pilot panel with the provided body copy
      and a button that copies the export asks as plain text.
3. Sticky right mini-TOC for dossier sections (desktop).

### Acceptance
- Dossiers for San Jose, Dallas, Detroit, Indianapolis render complete with zero
  claim-contract violations (snapshot tests).
- Every channel/offline recommendation cites ≥ 1 evidence link.
- Persona scores show confidence and at least 2 "why" contributions.
- Measurement proof gate unit tests cover synonym headers, first-transfer floor,
  unmapped row isolation, and no campaign-name geography inference.
- Playwright uploads the sample CSV and asserts the selected market flips to a
  clearly labeled sample-demo proof state without changing Xpat-owned proof
  aggregates.
- Print stylesheet: a dossier prints to a clean 3-5 page document (the leave-
  behind artifact for the CEO meeting).

---

## Cross-page acceptance

- Nav arc order fixed: Map, Competitors, Signals, Playbook.
- `?market=` param is honored by Map and Playbook and carried by cross-links.
- No horizontal overflow at 390px width on any page.
- Footer freshness table lists every artifact family with generatedAt.
- Playwright smoke: all 4 routes render, drawer opens, rate table shows either
  LIVE or SNAPSHOT chip, playbook deep link works.
