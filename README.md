# Xpat Audience Intelligence OS

A marketing intelligence prototype that shows where US NRI and
Asian Indian audience signals exist, what competitors are publishing, what
the community is saying, and what a marketing team could test next.

The product is intentionally evidence-first. Public, derived, snapshot,
generated, and connector-needed data are labeled separately so a prototype
insight is never presented as customer or campaign performance proof.

## Current product

- **Market Map:** Census-based market tiers, community anchors, employment
  proxy, student context, and cinema footprint.
- **Competitors:** runtime USD to INR quotes with snapshot fallback, public
  positioning and offer evidence, ad captures, and review themes.
- **Signals:** public community threads, creator evidence, review pain themes,
  and AI-answer visibility snapshots.
- **Playbook:** market-specific personas, channels, activation surfaces,
  experiments, measurement schema, AI market briefs, and evidence chat.
- **Private demo gate:** a shared password blocks pages, APIs, and assets.

This is a capability prototype. It is not a production customer-data,
attribution, campaign-management, or multi-tenant system.

## Read in this order

| File | Purpose |
|---|---|
| `AGENTS.md` | Contribution, data, security, and verification rules |
| `docs/00-PRD.md` | Product goals, claim contract, and success criteria |
| `docs/01-ARCHITECTURE.md` | Stack, repository layout, runtime routes, and environments |
| `docs/02-DATA-SPEC.md` | Data sources, artifact contracts, and refresh cadences |
| `docs/03-DESIGN-SYSTEM.md` | Visual system and copy rules |
| `docs/04-PAGE-SPECS.md` | Page behavior and acceptance criteria |
| `docs/05-IMPLEMENTATION-PLAN.md` | Historical build sequence and acceptance gates |
| `docs/06-HANDOFF.md` | Portable setup, ownership, operations, and first-week checklist |
| `docs/07-ACCESS-GATE.md` | Shared-password design and production limitations |
| `docs/decisions.md` | Current architecture and source decisions |
| `mockups/xpat-os-mockup.html` | Original static visual reference |

## Prerequisites

- Node.js 24, see `.nvmrc`
- pnpm 11.7.0
- Python 3 and `openpyxl` for the employment-pipeline tests

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
python3 -m pip install openpyxl
cp .env.example .env.local
```

Set a strong local value for `XPAT_ACCESS_PASSWORD`, then start the app:

```bash
pnpm run dev
```

The app fails closed when the password is missing.

## Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `XPAT_ACCESS_PASSWORD` | Required at runtime | Shared private-demo gate |
| `AI_GATEWAY_API_KEY` | Optional runtime | Local AI Gateway access |
| `CENSUS_API_KEY` | Optional pipeline | Live ACS market refresh |
| `REDDIT_CLIENT_ID` | Optional pipeline | Reddit application-only OAuth |
| `REDDIT_CLIENT_SECRET` | Optional pipeline | Reddit application-only OAuth |
| `REDDIT_USER_AGENT` | Optional pipeline | Team-controlled descriptive Reddit client identity |
| `YOUTUBE_API_KEY` | Optional pipeline | Creator refresh |
| `CRON_SECRET` | Optional diagnostic route | Protects webhook-backed FX capture |
| `FX_SNAPSHOT_WEBHOOK_URL` | Optional diagnostic route | External durable FX snapshot sink |

Vercel deployments can use the platform-provided AI Gateway OIDC flow instead
of `AI_GATEWAY_API_KEY`. Never commit environment values or use a
`NEXT_PUBLIC_` prefix for secrets.

## Data model and refreshes

The application renders committed, provenance-stamped JSON from
`data/artifacts/`. Raw downloads and large source files normally live under
ignored `data/raw/` and are not required for a standard build.

Run one pipeline family with:

```bash
node pipeline/run.mjs <family>
```

Run the complete pipeline with:

```bash
node pipeline/run.mjs all
```

Pipeline refreshes should happen on a feature branch. Review the artifact diff,
source dates, caveats, and deterministic output before merging.

Automatic daily FX artifact refresh is paused. `/api/fx` still provides the
runtime quote path with a committed snapshot fallback. An intentional snapshot
refresh uses:

```bash
node pipeline/run.mjs fx
```

## Verification

```bash
pnpm run lint
pnpm run lint:copy
pnpm test
pnpm run build
pnpm run test:e2e
```

For local production QA:

```bash
pnpm run build
pnpm run start -- --hostname 127.0.0.1 --port 3015
```

## Deployment

Create a new deployment project owned by the receiving team and connect it to
that team's repository. Configure at least `XPAT_ACCESS_PASSWORD` in both
Preview and Production before the first deployment.

Do not copy another maintainer's local `.env` files, deployment metadata,
tokens, or personal account access. Use new team-owned credentials and rotate
any temporary handoff password after acceptance.

The password gate is only a private-demo boundary. Do not ingest customer
exports or sensitive operational data until individual authentication,
authorization, audit logging, and retention controls are designed and reviewed.

## Repository hygiene

- Do not commit `.env*`, `.vercel/`, local caches, raw customer exports, or
  machine-specific paths.
- Do not store meeting transcripts, personal notes, family or employment
  context, account recovery details, or credentials in this repository.
- Preserve source dates and terms when refreshing public evidence.
- Use pull requests and keep `main` deployable.
