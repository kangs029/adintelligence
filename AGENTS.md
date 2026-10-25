# AGENTS.md: working rules for xpat-os

This repository contains a provenance-first marketing intelligence prototype.
The product and data contracts live in `docs/`, while
`mockups/xpat-os-mockup.html` remains the visual reference.

## Start here

Read these files before making a material change:

1. `README.md`
2. `docs/00-PRD.md`
3. `docs/01-ARCHITECTURE.md`
4. `docs/02-DATA-SPEC.md`
5. `docs/03-DESIGN-SYSTEM.md`
6. `docs/04-PAGE-SPECS.md`
7. `docs/06-HANDOFF.md`

## Hard rules

1. **No fake data.** Every rendered number comes from a
   provenance-stamped artifact or an explicitly labeled runtime source.
   Missing integrations render as `connector-needed`; the UI never invents
   fallback evidence.
2. **Enforce the claim contract.** Public data must not produce claims about
   spend, CAC, conversion, ROI, delivery, or individual identity. Generated
   text must pass the same contract and sanitization checks as static copy.
3. **Keep provenance visible.** Every evidence surface carries a source,
   capture date, method, and provenance class.
4. **Keep UI copy plain.** Do not use em dashes in user-facing strings.
   `pnpm run lint:copy` enforces this rule and the claim-copy rules.
5. **Verify external APIs before changing connectors.** Census, OpenFreeMap,
   app stores, Reddit, YouTube, FX sources, and ad libraries can change.
   Record durable source or architecture changes in `docs/decisions.md`.
6. **Use tests for data and claim logic.** Changes under `lib/` and
   `pipeline/` require focused tests. Pipeline output must be deterministic.
7. **Use reviewed Git changes.** Work on `feat/`, `fix/`, or `chore/`
   branches, open a pull request, require green CI and review, and do not push
   directly to `main`.
8. **Keep scope explicit.** New product ideas belong in the receiving team's
   backlog. Do not silently widen this prototype into an automated marketing
   or customer-data system.
9. **Respect data-source boundaries.** Use public or explicitly authorized
   data, respect robots.txt and rate limits, avoid login-walled scraping, and
   keep raw captures dated. Do not preserve direct-contact fields from public
   directory tags unless the product has a reviewed need for them.
10. **Keep secrets and personal data out of Git.** Use ignored local
    environment files or deployment-provider environment variables. Do not
    commit credentials, personal notes, local absolute paths, customer exports,
    or identifying customer data.

## Security boundary

The shared password gate is suitable for a private capability demo backed by
public and curated evidence. It is not sufficient for customer-identifiable,
regulated, financial-account, or production customer data. Those uses require
individual identity, authorization, auditing, retention rules, and a dedicated
data-access layer.

## Toolchain and verification

- Node.js 24
- pnpm 11.7.0
- Python 3 with `openpyxl` for employment-pipeline tests

```bash
pnpm install --frozen-lockfile
python3 -m pip install openpyxl
pnpm run lint
pnpm run lint:copy
pnpm test
pnpm run build
pnpm run test:e2e
```

Pipeline entry point:

```bash
node pipeline/run.mjs <family|all>
```
