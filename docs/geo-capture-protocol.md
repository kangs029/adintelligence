# Geo Visibility Capture Protocol

Purpose: create a dated benchmark for whether AI assistants name Xpat on USD to INR and India remittance discovery queries.

1. Open a fresh browser session for each assistant where practical. Avoid account personalization when the assistant allows it.
2. Run the configured query exactly as written in `data/artifacts/geo-visibility.json`.
   Current benchmark queries are:
   - `best way to send money from USA to India`
   - `cheapest USD to INR transfer`
   - `best remittance app for NRIs`
   - `Wise vs Remitly for India`
   - `is Xpat money transfer legit`
3. Capture a full answer screenshot and save it under `data/raw/geo/` with assistant, query slug, and date in the filename.
4. Record only providers actually named in the visible answer. Do not infer providers from citations, ads, or prior knowledge.
5. Set `xpatMentioned` to true only when Xpat, Xpat.money, or Remit2Any is named in the assistant answer.
6. If an assistant requires login, blocks browsing, or does not return an answer, leave the cell as `capture-pending` and record the reason.
7. Re-run monthly with the same query list unless the client changes the benchmark.

Caveat to preserve in the UI: AI assistant answers are dated visibility snapshots, not search volume, ranking stability, endorsement, conversion data, or campaign performance.
