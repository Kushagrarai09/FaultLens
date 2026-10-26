# Phase 7 — Release readiness

## Verdict

FaultLens is a **prototype MVP, not production-ready**. TypeScript builds prove compilation, not browser behavior, database persistence, real provider availability, authorization isolation, or deployment safety. Check CI on the integrated branch and perform the remaining runtime checks before release.

## Implemented MVP (source-level)

- AI-run metadata ingestion/history and pagination in PostgreSQL.
- Ollama generation endpoint; raw generation prompt/response are not persisted in AI-run history.
- Workspace-scoped latency and token analytics.
- Prompt templates/immutable versions, evaluation datasets/cases, comparison results, and a word-overlap heuristic score (not semantic evaluation).
- Manual/on-demand threshold alerts for failure rate, P95 latency, and failed-run count.
- API bearer authentication/role checks/workspace scoping and frontend login/register/logout, HTTP-only session cookie, proxy forwarding, and workspace switching; independently verify these flows.
- Docker Compose local orchestration, migration checksums/schema checks, guarded local seed data.
- Playwright browser tests using mocked API routes, with real PostgreSQL integration tests in separate CI jobs.

## Not implemented or intentionally postponed

- Background worker/queue processing. The placeholder worker was removed; current generation, evaluation, and alerts are synchronous. Add Redis/BullMQ only with a real job requirement, retry/backoff, dead-letter handling, worker health, graceful shutdown, and integration coverage.
- Scheduled alerts and external notification delivery.
- Incident management, deployment/change correlation, distributed tracing, automated root-cause analysis, and historical failure intelligence.
- Verified real cost calculation. Keep cost `null`/unavailable without verified provider/model prices, currency rules, and sufficient token usage. Unknown is not zero; don't hardcode prices in analytics logic.
- Production-ready distributed rate limiting, complete audit logging, secret-manager integration, dependency metrics, full request/response tracing, database backup/restore and migration rollback runbooks, complete CSRF strategy, reverse proxy/TLS configuration, production CORS, and container image scanning.

## CI workflow

See `.github/workflows/ci.yml`. It includes:

- Clean-checkout dependency installation and workspace package discovery.
- API unit/hardening tests, API lint/build, web lint/build.
- PostgreSQL 16 disposable service, test-migration checksum/schema checks, integration suite and API e2e command.
- Playwright browser journeys for login success/failure, registration, logout, unauthenticated dashboard access, dashboard loading/synthetic run creation, analytics, evaluations, alerts, API-unavailable messaging, and workspace switching. API routes are mocked so the browser tests verify UI interactions, not real API authorization/database behavior.
- Dependency vulnerability audit and committed-secret scanning.
- An explicit CI policy message that Ollama is mocked/not launched in the regular CI jobs.

CI currently uses `pnpm install --no-frozen-lockfile` because a frozen install has not yet been verified from a clean checkout with the full dependency graph. Regenerate the lockfile and switch to frozen installation only after that clean-install check succeeds.

## Local Windows PowerShell workflow

Requirements: Docker Desktop with Compose, Node.js 22, and pnpm 10.

```powershell
pnpm install --no-frozen-lockfile
Copy-Item .env.example .env
docker compose up --build
```

Open the web app at `http://localhost:3000`; the API is at `http://localhost:3001`, PostgreSQL at `localhost:5432`, and Ollama at `http://localhost:11434`. Compose applies migrations before the API starts.

To insert sample data, use a second terminal and only a local disposable database:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:faultlens_local_password@localhost:5432/faultlens"
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
pnpm db:seed:dev
```

Run Playwright locally:

```powershell
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

For PostgreSQL tests, set `TEST_DATABASE_URL` to a disposable database with `test`, `testing`, or `integration` in its name. Never point test migration/reset scripts at a development or production database.

## Production hardening checklist

- [ ] Replace in-memory limits with shared Redis-backed rate limiting before multiple API replicas.
- [ ] Add security-reviewed audit logging and secret-manager integration.
- [ ] Add dependency-health metrics and OpenTelemetry/equivalent distributed tracing.
- [ ] Document and test PostgreSQL backup/restore and migration rollback.
- [ ] Complete CSRF/session protection review for cookie-based authentication.
- [ ] Configure trusted reverse-proxy behavior, TLS termination, production CORS, and secure headers.
- [ ] Run container image scanning and review/fix dependency audit findings.
- [ ] Implement verified, versioned provider/model prices, currency support, known/missing token rules, and tests—or continue to report cost unavailable.
- [ ] Perform live Ollama success, failure, and timeout checks separately from mocked CI.
- [ ] Verify auth expiry, viewer write denial, and cross-workspace isolation on an integrated real API/database environment.
- [ ] Confirm clean install, all CI jobs, and local Docker startup before exposure.
- [ ] Complete an independent security review.

## Privacy

Prompt templates and dataset cases are stored intentionally for repeatable evaluation; do not use confidential data without an approved data-handling plan. Generation prompts and outputs are not stored in AI-run history. Never commit `.env`, credentials, tokens, or API keys.
