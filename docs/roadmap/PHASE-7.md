# Phase 7 — Release readiness and portfolio demo

## Verdict

FaultLens is an MVP prototype, **not production-ready**. A successful TypeScript build only proves compilation and static generation; it is not evidence of browser behavior, database persistence, provider connectivity, authorization isolation, or deployment safety.

## Implemented MVP (subject to CI/runtime verification)

- AI-run metadata ingestion, history and pagination.
- Ollama generation endpoint; generation prompt/output are not persisted in AI-run history.
- Per-workspace latency and token analytics.
- Prompt templates and immutable versions, evaluation datasets/cases, and comparison results. The current score is a word-overlap heuristic, not semantic quality.
- Manual/on-demand threshold alert rules. No scheduler or external notification delivery is included.
- API bearer-token authentication and server-side workspace-scoped authorization; frontend login/register/logout, HTTP-only session cookie handling, proxy forwarding, and workspace switching are present on the integration branch and require browser/security verification.
- Local Docker Compose setup, checksum-tracked migration runner, required-table validation, and guarded development seed.
- Playwright browser checks using API mocks; these verify UI behavior but do not prove the real API/database/provider path.

## Explicitly postponed

- Worker/queue processing. The previous worker merely logged a startup message; its package, Docker service, CI build, and production-architecture references are removed. The MVP stays synchronous. Reconsider BullMQ/Redis only with concrete job types, retry/backoff, dead-letter handling, health/readiness behavior, shutdown, and Redis-backed tests.
- Scheduled alert evaluation, notification delivery, incident management, deployment/change correlation, distributed tracing, automated root-cause analysis, and historical failure intelligence.
- Real cost calculation. Analytics returns unknown/unavailable cost (`estimatedUsd: null`) without verified provider/model prices and known usage. Do not hardcode a model price or convert unknown cost into zero.

## CI verification

`.github/workflows/ci.yml` runs:
- Fresh-checkout install and workspace package discovery.
- API unit/hardening tests, lint and build; web lint and build.
- PostgreSQL migration checksum/schema validation plus integration tests and API e2e command against a disposable PostgreSQL service.
- Playwright browser flows for login/register, dashboard loading, synthetic run creation, analytics, evaluations, alerts, API-unavailable errors, authentication failures, and workspace switching. API responses are explicitly mocked for these browser tests.
- Dependency audit and secret scanning.
- A separate explicit CI note that live Ollama testing is not performed by the mocked test jobs.

Current CI uses `pnpm install --no-frozen-lockfile` until the committed pnpm lockfile is regenerated from all package manifests and a frozen install succeeds from a fresh checkout.

## Remaining production-hardening work

- [ ] Replace in-memory rate limiting with shared Redis-backed limits before running multiple API replicas.
- [ ] Add security-reviewed audit logging and secret-manager integration.
- [ ] Add dependency-health metrics and OpenTelemetry/equivalent tracing, with safe request/response observability.
- [ ] Write and test PostgreSQL backup/restore and migration rollback procedures.
- [ ] Add complete CSRF/session review for cookie-authenticated state-changing requests.
- [ ] Define reverse-proxy headers, TLS termination, and exact production CORS origins.
- [ ] Add container image scanning and review/fix dependency audit findings.
- [ ] Add verified, versioned provider/model prices, currency handling, and tests for known/missing token usage and unknown models.
- [ ] Run live Ollama success/failure/timeout tests separately from the mocked suite.
- [ ] Verify all checks pass on the integrated branch and review cross-workspace/RBAC behavior before public exposure.

## Local Windows PowerShell verification

```powershell
pnpm install --no-frozen-lockfile
Copy-Item .env.example .env
docker compose up --build
```

In another PowerShell window, seed only local development data:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:faultlens_local_password@localhost:5432/faultlens"
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
pnpm db:seed:dev
```

Use a dedicated disposable database for PostgreSQL tests. Set `TEST_DATABASE_URL` to a database whose name includes `test`, `testing`, or `integration`. Never point the test migration command at a normal development or production database.

## Privacy and safety

- Use synthetic prompts/datasets during verification; prompt templates and evaluation cases are intentionally persisted.
- The API stores run metadata and sanitized error codes rather than raw generation prompts/responses.
- Do not commit `.env`, credentials, or provider secrets.
- Keep FaultLens private until the checklist and independent security review are completed.
