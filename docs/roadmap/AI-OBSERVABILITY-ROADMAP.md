# FaultLens AI Observability & Evaluation Roadmap

## Goal

Evolve FaultLens into a developer-facing platform for inspecting AI application behavior: request traces, latency, token usage, estimated cost, failures, prompt versions, and reproducible evaluations.

## Delivery rule

Build a vertical slice per phase. Each phase must have tests, a local verification checklist, and documentation. Do not introduce infrastructure before a concrete feature needs it.

Privacy defaults: do not persist raw prompts or completions unless a user explicitly opts in. Redaction and retention must be configurable and documented. Cost values are estimates and should be unavailable when usage or price data is missing.

## Existing project baseline

FaultLens is already a pnpm monorepo with `apps/web`, `apps/api`, and `apps/worker`. The existing README describes a Next.js frontend, NestJS API, PostgreSQL, Redis/BullMQ and an investigation workflow. Phase 0 is an audit, not a rewrite.

## Phases

### Phase 0 — Audit and run locally
- Run the existing monorepo and current tests.
- Inspect the web, API, worker, database package, migrations, Docker setup and environment variables.
- Document what currently works and what is incomplete.
- Define the smallest end-to-end AI-run slice.

**Done when:** local setup is repeatable and a baseline note identifies existing functionality and gaps.

### Phase 1 — Typed request lifecycle
- Define request/trace/span IDs and a validated AI-run event shape.
- Record provider/model, prompt version, start/end/duration, status, usage if available, and optional evaluation metadata.
- Add health checks, predictable errors and unit tests as needed.

**Done when:** the API accepts a valid synthetic run event and rejects malformed payloads consistently.

### Phase 2 — Persistence and querying
- Use the database tooling already present in the repository.
- Add persistence for projects/runs/spans and prompt versions where appropriate.
- Add paginated list/detail/filter endpoints and integration tests.

**Done when:** synthetic runs remain queryable after restart and filters behave correctly.

### Phase 3 — One real model provider
- Integrate one provider behind a small adapter; do not build multi-provider abstraction prematurely.
- Capture latency, status, error category, and available token usage.
- Handle timeout, rate limits, provider errors, retries where safe, and missing usage.
- Keep prompt/completion capture opt-in and apply redaction.

**Done when:** successful and failed calls appear in run history without exposing secrets.

### Phase 4 — Run explorer and dashboard
- Build a run list, filters, pagination and run details.
- Display status, timing, provider/model and available usage.
- Include sensible loading, empty and error states.

**Done when:** a developer can quickly find and inspect one failed or slow request.

### Phase 5 — Analytics and estimated costs
- Add model pricing metadata with provenance and an updated-at date.
- Estimate cost only when usage and matching pricing are known.
- Summarize volume, error rate, latency percentiles and token usage.
- Test rounding and missing-data cases.

**Done when:** figures match documented fixtures and unknown values aren't presented as zero.

### Phase 6 — Prompt versions and evaluations
- Store immutable prompt versions.
- Create a small dataset with inputs and expected outcomes/rubrics.
- Run the same dataset against different prompt versions.
- Compare evaluation score, latency, failures and estimated cost.
- Support evaluator explanations or human review; document evaluator limitations.

**Done when:** comparisons are repeatable, show trade-offs, and don't claim that one score proves universal correctness.

### Phase 7 — OpenTelemetry
- Instrument the request lifecycle with spans and propagate context.
- Correlate OpenTelemetry trace/span IDs with run details.
- Test parent-child relations and error status.
- Document exporter/collector configuration.

**Done when:** one run can be followed end to end using correlated trace identifiers.

### Phase 8 — Worker jobs, alerts and export
- Use the existing queue/worker architecture for long-running evaluations and report generation.
- Add configurable latency/error-rate thresholds with deduplication/cooldown.
- Export filtered runs/evaluation results.
- Test retries and idempotency.

**Done when:** jobs can fail/retry safely and users can export a report.

### Phase 9 — Hardening and public demo
- Add CI for lint, type-check, unit/integration tests and build.
- Add Playwright smoke tests for the critical user journey.
- Document architecture, schema, security/privacy choices and troubleshooting.
- Add seed data and a short demo.
- Deploy web, API, worker, database and Redis using suitable hosts.

**Done when:** a clean setup/deployment and the documented demo path work reliably.

## First sprint checklist

- [ ] Clone and install dependencies using the repository's documented package manager.
- [ ] Inspect root scripts and all app/package scripts.
- [ ] Start required infrastructure.
- [ ] Run lint, type-check, tests and build; record existing failures without hiding them.
- [ ] Test health endpoints and the first UI path.
- [ ] Write `docs/roadmap/BASELINE.md` with commands, outputs, gaps and the first vertical slice.
- [ ] Commit the audit before implementing new features.

## Suggested commit style

- `docs: record FaultLens local baseline`
- `feat(api): add validated AI run event schema`
- `test(api): cover invalid run payloads`
- `feat(db): persist AI run metadata`
- `feat(web): add AI run explorer`

Keep commits small and tied to one outcome.
