# FaultLens AI Observability & Evaluation Roadmap

## Goal

Evolve FaultLens into a developer-facing platform for inspecting AI application behavior: request traces, latency, token usage, estimated cost, failures, prompt versions, and reproducible evaluations.

## Important audit finding

The README (.README) describes a broad intended production incident investigation system, but the current main-branch implementation is still a starter skeleton:
- `apps/web/src/app/page.tsx` renders the default Next.js starter page.
- `apps/api/src/app.controller.ts` returns `Hello World!`.
- `apps/worker/src/index.ts` only logs that the worker started.
- The API has basic unit and e2e starter tests.
- The API package does not yet include a database client, Redis, or BullMQ.
- The inspected tree does not include an implemented database/shared package, docker-compose file, or GitHub Actions workflow.
- Root `dev` script filters app packages for a `dev` script, while API currently exposes `start:dev` and no `dev`; check this mismatch during baseline verification.

Therefore, treat documented capabilities as intended features until code and tests prove they work. Phase 0 should verify the local setup and record the baseline before rewriting configuration or architecture.

## Product scope and feature priorities

### P0 — Foundation and first vertical slice
1. Baseline local setup; document current scripts, environment variables and known failures.
2. A validated API endpoint accepting synthetic AI-run events.
3. Typed run metadata and predictable error responses.
4. Automated API tests for valid and invalid payloads.
5. PostgreSQL persistence and migrations.
6. A real dashboard that fetches run history from the API, with detail view, pagination, filtering, loading and error states.
7. Seeded synthetic demo data.

### P1 — Real observability
8. Integrate one model provider behind a small adapter.
9. Capture status, duration, model/provider identifiers, available token usage and sanitized error categories.
10. Privacy-by-default: no raw prompt/completion capture unless explicitly enabled; add redaction and retention configuration.
11. Usage analytics, latency percentiles and estimated cost with versioned pricing metadata.
12. Immutable prompt versions and repeatable evaluation of two prompt versions against the same dataset.

### P2 — Advanced capabilities
13. OpenTelemetry span instrumentation and correlation with persisted run identifiers.
14. Redis/BullMQ only once a real background evaluation or report job requires it.
15. Configurable alerts with cooldown/deduplication and exportable evaluation reports.
16. CI, end-to-end smoke tests, deployment, architecture documentation, and a demo walkthrough.

### Later — Out of the MVP
- Full SRE incident management, failure graphs, service dependency graphs, chaos experiments, historical incident similarity, and automated root-cause suggestions.
- Multi-provider integration before the first provider works reliably.
- Splitting the modular app into microservices.
- Persistent raw prompt/completion data by default.

## Phase 0 — Audit and run locally
- [ ] Check Node.js, pnpm and Docker versions.
- [ ] Install dependencies using the repository's pnpm workspace.
- [ ] Inspect root and app scripts for web, API and worker.
- [ ] Identify PostgreSQL/Redis requirements and required environment variables.
- [ ] Run lint, tests and build; record existing failures precisely.
- [ ] Verify web and API launch and document current behavior.
- [ ] Complete `docs/roadmap/BASELINE.md`.
- [ ] Choose the smallest synthetic-run vertical slice.

**Done when:** setup is reproducible or blockers are documented, current functionality is accurately recorded, and the first implementation task is clearly defined.

## Phase 1 — Synthetic AI run ingestion
- [ ] Define request, trace and span IDs; provider/model; prompt version; timestamps/duration; status; optional token usage and safe error category.
- [ ] Add validated `POST /runs` (align route prefix with the current API conventions).
- [ ] Return predictable errors.
- [ ] Test malformed input, missing optional usage and duplicate/idempotency behavior where supported.
- [ ] Any temporary in-memory storage must be clearly marked and replaced in Phase 2.

**Done when:** a synthetic run is accepted, validated, and tested end-to-end at the API boundary.

## Phase 2 — Durable persistence
- [ ] Choose a database client/ORM deliberately and document the choice.
- [ ] Introduce PostgreSQL and migrations.
- [ ] Persist runs and query by time, status, provider/model; add pagination and run details.
- [ ] Add database integration tests.

**Done when:** run records survive restarts and query results are deterministic.

## Phase 3 — Real provider instrumentation
- [ ] Integrate one provider.
- [ ] Record latency, outcome, available token usage and sanitized failures.
- [ ] Handle timeout, rate limits and missing usage.
- [ ] Use mocks in routine tests so a live provider key is not required.
- [ ] Keep raw content capture opt-in, redacted and retention-bounded.

**Done when:** a real successful and failed model request can be inspected without leaking secrets.

## Phase 4 — Dashboard
- [ ] Replace the starter page with a real run explorer.
- [ ] Connect to API data.
- [ ] Add run details, basic summary metrics, pagination and filters.
- [ ] Implement loading, empty, failure and retry UI states.

**Done when:** a developer can find and inspect a slow or failed request.

## Phase 5 — Analytics
- [ ] Aggregate volume, error rate, latency percentiles and token usage.
- [ ] Add pricing configuration with source and last-updated date.
- [ ] Calculate estimated cost only when both usage and applicable pricing are known.
- [ ] Test rounding, missing data and price-version changes.

**Done when:** analytics match known fixtures; missing values are not silently treated as zero.

## Phase 6 — Prompt versions and evaluation
- [ ] Store immutable prompt versions.
- [ ] Create a starter dataset (for example 50 representative questions) with expected outcomes or rubrics.
- [ ] Run the same dataset against different prompt versions.
- [ ] Compare scores, latency, error rate and known estimated cost.
- [ ] Document evaluator limitations and allow human review.

**Done when:** evaluation runs are reproducible and the report communicates trade-offs rather than claiming universal correctness.

## Phase 7 — OpenTelemetry
- [ ] Add spans and trace context propagation.
- [ ] Correlate telemetry with stored run IDs.
- [ ] Test parent-child spans and error status.
- [ ] Document export configuration.

**Done when:** a single AI call can be traced and correlated with its dashboard record.

## Phase 8 — Jobs, alerts and exports
- [ ] Implement Redis/BullMQ when a real asynchronous evaluation/report workload exists.
- [ ] Add threshold alerts with cooldown/deduplication.
- [ ] Add report export.
- [ ] Test retry safety and idempotency.

**Done when:** background work is observable, failed jobs are handled safely, and reports export reliably.

## Phase 9 — Hardening and portfolio
- [ ] Add GitHub Actions for install, lint, type-check, tests and build.
- [ ] Add an end-to-end test for request -> persisted run -> dashboard details.
- [ ] Document system boundaries, data model, privacy controls, known limitations and setup.
- [ ] Add seeded demo data and a concise walkthrough.
- [ ] Deploy after a reproducible local setup and reliable CI.

**Done when:** the app can be reliably demonstrated from a clean setup and README claims match shipped behavior.

## Engineering rules

- Finish and verify one phase before moving on.
- Each feature needs tests, a local verification checklist, and documentation.
- Prefer a modular monolith over premature microservices.
- Do not persist raw prompts or completions by default.
- Cost is an estimate; unknown usage/pricing means unavailable, not zero.
- Keep commits small and meaningful.


## Implementation numbering note

The feature branches have now implemented run ingestion, dashboard, Ollama generation, prompt evaluation, and reliability alerts as Phases 1–6. The current release-readiness work is tracked as [Phase 7](PHASE-7.md). OpenTelemetry and heavier background processing remain later enhancements, not prerequisites for this portfolio release. Keep this mapping aligned with the README as the project evolves.
