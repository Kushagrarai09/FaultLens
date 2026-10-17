# Phase 4 — Usage and performance analytics

## Goal

Give developers trustworthy, all-time aggregates across stored AI runs without treating missing data as zero or inventing model costs.

## API

`GET /api/analytics/summary`

Returns:
- Total, successful, and failed run counts.
- Success and failure rates (null when there are no runs).
- Average, p50, and p95 latency in milliseconds.
- Summed input/output tokens and counts of runs that supplied each token field.
- Up to 20 provider/model groups with run counts, success rate, average latency, p95 latency, and known token totals.
- Cost availability metadata. Estimated cost is deliberately null until pricing for a provider/model can be configured and verified.

The endpoint aggregates all rows in PostgreSQL; it is not limited to the latest 50 rows shown in the run explorer.

## Dashboard

Open `/analytics` from the local Next.js app to view the analytics summary. It loads from a same-origin Next.js route proxy, shows loading/error/empty states, and supports manual refresh.

## Metric definitions

- Success rate = successful runs / all runs × 100.
- Failure rate = failed runs / all runs × 100.
- Average latency is the arithmetic mean of `duration_ms`.
- p50 and p95 are PostgreSQL continuous percentiles over recorded run durations.
- Token totals include only known token counts. Coverage counts make missing usage visible.
- Cost is unknown, not $0, because the current local Ollama integration does not provide a verified pricing table.

## Data and privacy

This phase reads only existing run metadata. It does not add raw prompt or response storage and requires no schema migration.

## Local verification checklist

- [ ] Apply the existing Phase 1 migration and start PostgreSQL.
- [ ] Start API and web app using the Phase 3 guide.
- [ ] Open `http://localhost:3000/analytics`.
- [ ] Check empty-database state.
- [ ] Create demo runs and generate at least one local Ollama response, then refresh analytics.
- [ ] Compare counts, rates, token sums, and latency values with the run records.
- [ ] Run `pnpm --filter api test`, `pnpm --filter api build`, and `pnpm --filter web build`.
- [ ] Confirm costs remain unavailable until a documented pricing source/configuration is implemented.

## Known limitations

- The API aggregates all rows and can become expensive on very large tables; indexes or time-bounded query options can be added when real data shows a need.
- Model breakdown is capped at 20 groups.
- No provider-specific pricing is configured, so costs are not estimated.
- Implementation has not been locally built or exercised yet; do not treat this phase as verified until the checklist passes.
