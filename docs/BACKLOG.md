# Maintainer Backlog

This is a starting inventory, not an approved roadmap. The receiving product
owner should validate demand, data access, compliance, cost, and ownership
before activating an item.

## Data operations

- Refresh public artifacts and document new capture dates.
- Decide whether any artifact family needs a reviewed schedule.
- Add a durable storage sink before reintroducing automatic FX history capture.
- Re-verify Reddit, YouTube, ad-library, app-store, and FX source terms.

## Product completeness

- Expand evidence chat only when a specific operator question requires another
  read-only tool.
- Add deterministic run history and computed artifact change summaries.
- Improve source labels that expose internal artifact naming.
- Review mobile and print acceptance against current browsers.

## Production readiness

- Replace the shared password with individual identity and authorization before
  adding sensitive owned data.
- Define data retention, audit logging, access review, and incident ownership.
- Add monitoring for runtime routes, AI cost, connector failures, and artifact
  staleness.
- Document team-owned deployment, API, and billing accounts.
- Resolve the existing TypeScript errors in test fixtures, then add a standalone
  `tsc --noEmit` check to CI.

## Explicitly out of scope until approved

- Automated community posting or replies
- Ad-account writes
- Customer-level profiling
- Performance or ROI claims derived from public data
- Login-walled scraping
- Unreviewed ingestion of customer or campaign exports
