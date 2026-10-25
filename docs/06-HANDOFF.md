# 06: Maintainer Handoff

This document is the portable starting point for a new maintainer. It contains
the repository, runtime, deployment, and security knowledge needed to take over
the prototype without access to another developer's machine or personal
accounts.

## Handoff scope

The repository includes:

- A working Next.js application with five user-visible routes
- Committed, provenance-stamped data artifacts
- Local pipeline code for public-source refreshes
- Unit, copy-contract, build, and browser tests
- A shared-password gate for private demonstrations
- Optional AI Gateway features for grounded market briefs and evidence chat

The repository does not include:

- Personal environment files or credentials
- Deployment-provider account access
- Large ignored raw-source downloads
- Customer-identifiable data
- A production authentication or authorization system
- A promise that historical public-source artifacts are current

## Product tour

1. `/`: Market Map, audience tiers, community anchors, and supporting context.
2. `/competitors`: Runtime FX evidence, public positioning, offers, ads, and
   app-review themes.
3. `/signals`: Community threads, creators, category pain themes, and AI-answer
   visibility snapshots.
4. `/playbook`: Market-specific personas, channel hypotheses, activation
   surfaces, experiments, measurement schema, and grounded AI briefs.
5. `/sources`: Artifact freshness, methods, provenance, and caveats.

The evidence chat drawer is read-only. Its tools can query committed artifacts
but cannot change application data or external systems.

## Local setup

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
python3 -m pip install openpyxl
cp .env.example .env.local
```

Replace the `XPAT_ACCESS_PASSWORD` placeholder in `.env.local`, then run:

```bash
pnpm run dev
```

Do not copy another maintainer's `.env.local`, `.vercel/`, tokens, browser
sessions, or credential files.

## Repository map

| Path | Responsibility |
|---|---|
| `app/` | Next.js pages, layouts, and route handlers |
| `components/` | Product UI grouped by page or shared shell |
| `lib/data/` | Typed artifact loading and validation |
| `lib/claims/` | Public-data claim contract |
| `lib/ai/` | AI model routing and generated-copy sanitization |
| `lib/playbook/` | Deterministic dossier and recommendation composition |
| `pipeline/` | Public-source ingestion, normalization, and artifact generation |
| `data/artifacts/` | Committed application evidence |
| `data/curation/` | Human-reviewed overlays with explicit provenance |
| `public/evidence/` | Committed public-source screenshots used by the UI |
| `tests/e2e/` | Browser acceptance coverage |
| `docs/` | Product, data, architecture, security, and decision contracts |

## First-week acceptance checklist

The receiving maintainer should complete these steps before adding features:

1. Read `README.md`, `AGENTS.md`, and `docs/00` through `04`.
2. Install from the lockfile using Node.js 24 and pnpm 11.7.0.
3. Run the full verification suite:

   ```bash
   pnpm run lint
   pnpm run lint:copy
   pnpm test
   pnpm run build
   pnpm run test:e2e
   ```

4. Open all five routes locally and verify the password gate.
5. Review the `generatedAt`, source, and caveat fields for every artifact before
   presenting evidence as current.
6. Create a team-owned deployment project and configure new team-owned
   environment values.
7. Verify unauthenticated page, API, and asset requests remain blocked.
8. Rotate the temporary handoff password after deployment acceptance.
9. Confirm the current owner and reviewer for application, data, and deployment
   changes.

## Deployment ownership

The receiving team should own:

- The Git repository or organization where ongoing development occurs
- The Vercel project or equivalent Next.js hosting project
- Environment variables and AI Gateway billing
- External API registrations and quotas
- Source refresh schedules and rate-limit compliance
- Access reviews and offboarding
- Operational monitoring and incident response

Do not add maintainers to unrelated personal hosting teams or reuse credentials
from an earlier deployment.

## Data refresh ownership

Committed artifacts are snapshots, not a live warehouse. Before refreshing a
family:

1. Re-verify the current official source and terms.
2. Supply connector values only through local or provider environment settings.
3. Run the pipeline on a feature branch.
4. Inspect source dates, capture dates, caveats, and record counts.
5. Run the same pipeline twice and confirm the second run is deterministic.
6. Review the artifact diff before merge.

The automatic daily FX artifact workflow is intentionally absent. Runtime FX
still has an hourly cache and snapshot fallback. A committed refresh is manual.

## Security and privacy boundary

The current access gate uses one shared password. It is appropriate only for a
private capability demonstration backed by public and curated evidence.

Do not ingest customer exports, campaign-account credentials, regulated
financial data, or identifiable customer records until the team has implemented
and reviewed:

- Individual identities
- Authorization and least-privilege roles
- Audit logging
- Data minimization and retention
- Encryption and key ownership
- Incident and access-revocation procedures

See `docs/07-ACCESS-GATE.md` for the current boundary.

## Known limitations

- Public artifacts become stale and require explicit refresh.
- Several evidence families require optional external API credentials.
- `connector-needed` states are intentional and should not be replaced with
  sample numbers presented as real.
- The evidence chat implements a bounded read-only tool set, not every possible
  artifact query.
- The shared gate is not user authentication.
- Historical Git commits may contain earlier implementation notes even after
  the current tree is sanitized. Repository history cleanup is a separate,
  coordinated operation.

## Change workflow

1. Pull the latest `main`.
2. Create a `feat/`, `fix/`, or `chore/` branch.
3. Make the smallest coherent change.
4. Run focused tests, then the full relevant verification.
5. Open a pull request with scope, evidence, risks, and verification.
6. Require green CI and reviewer approval.
7. Merge only when the receiving team's deployment path is understood.
