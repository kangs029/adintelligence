# 03 — Design System

The product is a **dark-only operator console**: Linear/Vercel-dashboard
discipline, evidence-first density, zero marketing gloss. The HTML mockup
(`mockups/xpat-os-mockup.html`) is the visual source of truth; this doc defines
the tokens and rules behind it so implementation stays consistent beyond the
mocked screens.

## 1. Principles

1. **Evidence before decoration.** Every visual flourish must serve reading
   speed or trust. No gradients-for-vibes, no glassmorphism.
2. **Provenance is visible everywhere.** The chip system (§7) is the brand.
3. **Dense but calm.** Small type, generous line-height, hairline borders,
   restrained color. Color means something (tier, provenance, status) or it
   isn't there.
4. **One accent.** Teal. Everything else is neutral or semantic.

## 2. Color tokens

Define as CSS custom properties in `app/globals.css`; Tailwind v4 maps them to
utilities. Dark-only (no light theme in v2.0).

```css
/* surfaces */
--bg-page:      #0B0C0F;   /* page plane */
--bg-surface:   #14161B;   /* cards, panels, drawer */
--bg-raised:    #1B1E25;   /* hover states, nested panels, inputs */
--bg-overlay:   #232730;   /* popovers, tooltips */

/* ink */
--ink-primary:  #F2F3F5;
--ink-secondary:#A8ADB8;
--ink-muted:    #6C7280;

/* lines */
--line-hair:    rgba(255,255,255,0.08);
--line-strong:  rgba(255,255,255,0.16);

/* accent (Xpat teal) */
--accent:       #2DD4BF;   /* teal-400 family; primary actions, active nav, selection */
--accent-ink:   #062E2A;   /* text on accent fills */
--accent-dim:   rgba(45,212,191,0.12);  /* selected-row wash, active filter bg */

/* semantic */
--good:         #0CA30C;
--warning:      #FAB219;
--serious:      #EC835A;
--critical:     #D03B3B;
```

## 3. Tier colors (map + chips)

Tier is an ordinal scale; use one hue (accent teal) stepped, not four hues:

| Tier | Token | Value | Use |
|---|---|---|---|
| 1 Launch-planning | `--tier-1` | `#2DD4BF` | brightest, largest dots |
| 2 Growth | `--tier-2` | `#1FA396` | |
| 3 Discovery | `--tier-3` | `#177A72` | |
| 4 Audit hold | `--tier-4` | `#3A4148` | neutral gray, off by default |

Map dots also scale radius by AI population (sqrt scale), so tier = lightness
and size = magnitude, two independent channels.

## 4. Typography

- Sans: Geist Sans. Mono: Geist Mono (numbers in tables, geoids, timestamps,
  code-ish metadata).
- Scale (px/lh): display 28/34 (page KPIs only), h1 20/28, h2 16/24, body 14/22,
  small 12.5/18, micro 11/16 (chips, axis labels, timestamps).
- `font-variant-numeric: tabular-nums` on every table/aligned numeric column.
- Sentence case everywhere. Micro-labels (chips, column headers) may use
  11px/500 with 0.02em tracking. Never all-caps body text.

## 5. Spacing, radius, elevation

- 4px base grid. Card padding 16; section gap 24; page gutter 24 (desktop),
  16 (narrow).
- Radius: 10 for cards/drawers, 8 for inputs/buttons, 999 for chips.
- Elevation = borders, not shadows: cards are `--bg-surface` + `--line-hair`
  border. The only shadow allowed: the market drawer and popovers
  (`0 8px 32px rgba(0,0,0,0.45)`).

## 6. Core components (inventory)

- **TopNav**: product mark "XPAT OS" (Geist Mono, accent dot), 4 tabs, right side:
  data-freshness indicator ("data as of Jul 2, 2026" + link to sources sheet),
  optional demo-gate user chip. Height 56, `--bg-page`, hairline bottom.
- **PageHeader**: h1 + one-line purpose + KPI strip (3-5 stat tiles).
- **StatTile**: label (micro, muted) over value (display, tabular) over delta/
  context line (small). No borders between tiles; hairline group container.
- **ProvenanceChip**: §7.
- **SourceLink**: 12.5px, muted, underline on hover, external-link icon 12px.
  Every evidence card ends with one.
- **EvidenceCard**: surface card with header row (title + ProvenanceChip),
  body, footer (SourceLink + capturedAt/publishedAt in mono micro).
- **FilterRail**: 260px left rail (map page) / horizontal filter row (other
  pages). Single-select segmented controls + multi-select comboboxes. Active
  filters get `--accent-dim` bg + accent text. One "reset" ghost button.
- **MarketDrawer**: 420px right slide-over, `--bg-surface`, full-height scroll,
  sticky header with market name + tier chip + close.
- **DataTable**: 13px, tabular-nums, row hover `--bg-raised`, sortable headers,
  right-aligned numerics, sticky header row.
- **EmptyState / ConnectorNeeded**: §9.
- **Tabs (in-page)**: underline style, accent for active.

## 7. Provenance chips (the signature primitive)

Pill, 11px/500, icon 12px, radius 999, 1px border, transparent-ish fills:

| Class | Label | Border/text | Fill | Icon |
|---|---|---|---|---|
| live | LIVE | `#2DD4BF` | rgba(45,212,191,.10) | pulse dot (animated 2s) |
| snapshot | SNAPSHOT · {date} | `#5598E7` | rgba(85,152,231,.10) | camera |
| grounded | GROUNDED · {release} | `#9085E9` | rgba(144,133,233,.10) | database |
| derived | DERIVED | `#C98500` | rgba(201,133,0,.10) | function/fx |
| connector-needed | CONNECTOR NEEDED | `#6C7280` dashed border | none | plug |

Rules: exactly one chip per card/section; chips never carry meaning by color
alone (label text always present); the TopNav links to a legend popover
explaining all five.

## 8. Charts (dataviz method — binding)

Charts follow the dataviz procedure: form first, color by job, validate, thin
marks, hover layer, accessibility pass.

- **Surfaces for validation**: chart surface = `--bg-surface` `#14161B`.
  Before shipping, run the palette validator (bundled dataviz skill,
  `scripts/validate_palette.js "<hexes>" --mode dark --surface #14161B`) on the
  categorical set below and fix any FAIL by snapping to nearest passing step.
- **Categorical order (fixed, never cycled)** for provider/competitor series:
  Xpat = accent teal `#2DD4BF` always; Remitly `#3987E5` blue, Wise `#9085E9`
  violet, Xoom `#C98500` yellow, Western Union `#E66767` red, Aspora `#D96AA7`
  pink, and Crobo `#D27A3F` orange. Aqua/green is deliberately excluded from
  competitor colors because it sits too close to Xpat's teal. Filters never
  repaint survivors.
- **Sequential** (map choropleth alternatives, heat cells): teal ramp, one hue,
  light→dark, min step ≥ 2:1 on surface.
- Marks: 2px lines, 4px rounded bar ends anchored to baseline, ≥8px hover
  markers, 2px surface gap between adjacent/stacked fills.
- Every multi-series chart: legend + ≤4 series direct-labeled; tooltip crosshair
  on lines, per-mark tooltip on bars; axis/grid in `--line-hair`/`--ink-muted`.
- One axis per chart. Rate-margin trend and volume never share a plot.
- Numbers in tooltips/axes: Geist Mono, tabular.

## 9. Empty states and connector-needed states

Designed, not apologetic:
- Icon (plug/upload), one-line statement of what's missing, the exact schema
  expected (mono, copyable), and who provides it ("Requires Xpat Google Ads
  export"). Dashed hairline border. Never a spinner that never resolves; never
  invented sample numbers. A muted "what this unlocks" line ties it to the demo
  narrative (e.g., "unlocks CAC-vs-opportunity comparison").

## 10. Motion

- Drawer: 240ms ease-out slide + fade. Hover states: 120ms. Map flyTo: 800ms.
- LIVE chip pulse: 2s opacity loop. Nothing else animates. Respect
  `prefers-reduced-motion` (disable pulse + flyTo becomes jumpTo).

## 11. Voice and copy rules

- No em dashes anywhere in UI copy (hard rule). Commas, periods, or rewrite.
- Sentence case. Plain words: "markets", "evidence", "what this proves",
  "what this does not prove".
- Numbers: thousands separators; population rounded to nearest 100 in cards
  (exact in tooltips); percentages 1 decimal.
- Timestamps: "Jul 2, 2026" for dates, mono "2026-07-02 14:05 PT" for capture
  metadata.
- Every recommendation card includes a "What this does not prove" line. This is
  a feature, not a disclaimer: it is the product's credibility signature.
