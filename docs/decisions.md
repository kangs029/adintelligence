# Architecture and Data Decisions

This file contains durable decisions needed to operate the current prototype.
It intentionally excludes session transcripts, personal machine details,
credential-retrieval notes, agent orchestration, and temporary debugging logs.

## Runtime and package manager

- Use Node.js 24 and pnpm 11.7.0.
- Install from `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`.
- Python is used only where a source format requires it. The current CI installs
  `openpyxl` for employment-pipeline tests.
- The application must build and render honest connector-needed states without
  optional AI or data-pipeline credentials.

## Provenance and artifact model

- Application evidence is committed under `data/artifacts/`.
- Each artifact records source, method, generated or captured date, refresh
  cadence, provenance class, and caveats.
- Artifact serialization is deterministic so reviewed refreshes produce
  meaningful Git diffs.
- Public data can support hypotheses and market-selection evidence. It cannot
  establish spend, CAC, conversion, ROI, delivery, or individual identity.
- Missing owned data remains `connector-needed`; the application does not fill
  gaps with invented numbers.

## Census markets

- The market pipeline uses ACS five-year detailed tables and Census CBSA
  geography.
- Live ACS pulls require `CENSUS_API_KEY`.
- The fetcher rejects HTML, missing-key responses, and schema drift instead of
  silently producing an artifact.
- CBSA points come from Census TIGERweb and join by GEOID.
- Estimates and margins of error remain visible. Low-reliability rows are kept
  in an audit artifact rather than silently discarded.

Primary references:

- https://api.census.gov/data.html
- https://www.census.gov/data/developers/data-sets.html
- https://www.census.gov/data/developers/data-sets/TIGERweb-map-service.html

## Community anchors

- OpenStreetMap Overpass is a public-source snapshot input.
- Queries use explicit rate limits, retry, and backoff.
- Broad sweeps can be slow or rate-limited, so reviewed snapshot inputs and
  stable OSM identifiers are acceptable when artifact caveats disclose the
  coverage.
- Anchor QA rules remain reviewable code. Community places are presence
  evidence, not customer counts.

Primary reference:

- https://wiki.openstreetmap.org/wiki/Overpass_API

## Employment, students, and cinema

- DOL LCA disclosures are an employer/workforce proxy, not employee headcount,
  nationality, approval, or individual-location proof.
- SEVIS state values are labeled as state allocation unless a reviewed
  campus-level join exists.
- Cinema evidence is cultural-presence corroboration, not remittance demand.
- Raw releases should come from their authoritative public source or an
  approved sanitized handoff bundle.

## Runtime FX and competitor quotes

- Frankfurter provides the mid-market reference path.
- Public provider quote paths are used only when they expose a complete,
  unauthenticated, machine-readable quote.
- A provider without a complete verified path renders `connector-needed`.
- `/api/fx` uses an hourly cache and falls back visibly to the most recent
  committed snapshot.
- Near-mid-market promotional or timing-skewed rows are not automatically
  promoted as the best quote.
- A margin trend requires enough distinct capture days to avoid presenting one
  or two points as a meaningful trend.

Primary references:

- https://frankfurter.dev/
- https://docs.wise.com/guides/product/send-money/quotes/unauthenticated-quote

## Ads, positioning, and reviews

- Public ad-library and landing-page evidence is captured at low frequency and
  stores source URLs and dates.
- Public creative proves visible footprint only. It does not prove spend,
  targeting, delivery, or performance.
- Positioning curation may remove extraction noise but may not introduce a
  claim absent from the captured page.
- Review themes use transparent rules and real public excerpts. Sample size and
  capture window remain visible.
- App-store source availability is provider-specific. Zero-sample rows remain
  explicit rather than being backfilled.

## Reddit and YouTube connectors

- Reddit refreshes use application-only OAuth with
  `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.
- Requests use a descriptive, maintainer-controlled User-Agent and respect
  platform limits.
- YouTube creator refreshes require `YOUTUBE_API_KEY`.
- Missing credentials produce connector-needed artifacts and never block the
  standard application build.

## Trends and AI-answer visibility

- Google Trends automation is treated as brittle. If a stable reviewed path is
  unavailable, the section stays connector-needed.
- AI-answer visibility is a dated manual benchmark using the protocol in
  `docs/geo-capture-protocol.md`.
- Assistant answers are visibility snapshots, not rankings, endorsements,
  demand, conversion, or performance evidence.

## Playbook and measurement proof

- Persona and channel scores are deterministic recommendations with confidence,
  not hard audience labels.
- Target zones derive from reviewed community-place evidence and never invent a
  locality name.
- Uploaded measurement CSV parsing remains client-side.
- Sample rows are visibly labeled and excluded from owned-data aggregates.
- Geography comes only from explicit market fields, not campaign-name guessing.
- Public evidence and owned measurement data must remain separate in copy and
  calculations.

## AI market briefs and evidence chat

- Models route through the Vercel AI Gateway using one centrally configured
  model identifier.
- AI output is grounded only in committed artifact facts.
- Generated briefs pass a post-generation sanitizer and claim-contract tests.
- Pre-generated demo briefs carry generated provenance, model, date, and source
  hash.
- Evidence chat tools are pure reads over committed artifacts. They cannot write
  application data or call external operational systems.
- Missing AI credentials produce a connector-needed response.

Primary reference:

- https://ai-sdk.dev/docs

## Shared-password access gate

- `XPAT_ACCESS_PASSWORD` is server-only and required in Preview and Production.
- `proxy.ts` protects pages, APIs, public files, images, Open Graph assets, and
  Next.js assets.
- The access cookie contains a version, signed expiry, and HMAC, never the
  plaintext password.
- Signed expiry is verified server-side. Password rotation invalidates existing
  sessions.
- Missing configuration fails closed with `503`.
- Gate responses are `no-store` and `noindex`.
- The gate is suitable for a private public-data prototype, not sensitive
  customer data.

See `docs/07-ACCESS-GATE.md`.

## FX automation

- The scheduled daily FX workflow was removed after repeated failures and
  because automatic artifact refresh was not an active operating requirement.
- The manual pipeline and runtime FX route remain available.
- Any future schedule must use a durable storage or reviewed pull-request path,
  least-privilege permissions, failure monitoring, and an explicit owner.

## Portable handoff

- The repository must not depend on a maintainer's absolute filesystem paths,
  personal email, private notes, browser sessions, or AI-tool subscriptions.
- New maintainers use Node.js 24, pnpm 11.7.0, `.env.example`, and
  `docs/06-HANDOFF.md`.
- The receiving team creates and owns deployment projects, credentials,
  connector registrations, billing, monitoring, and access reviews.
- Implementation transcripts and completed task-by-task agent plans are not
  operational documentation and do not belong in the maintained tree.
