# FaultLens

FaultLens is a monorepo MVP for AI-run metadata, Ollama generation, token/latency analytics, prompt versioning and evaluation, and manual threshold-based reliability alerts.

> **Release status: not production-ready.** Browser checks and CI are being added; PostgreSQL integration must pass on CI; live Ollama behavior and deployment security still need verification.

## Implemented MVP (source-level; verify in CI)
- PostgreSQL-backed AI-run metadata and history.
- Ollama generation endpoint; generation prompts and responses are not persisted in AI-run history.
- Per-workspace run, latency, and token analytics.
- Versioned prompt templates, evaluation datasets, and prompt comparisons. The current comparison score is a simple word-overlap heuristic, not semantic correctness.
- Manual/on-demand threshold alert rules. Alerts are not scheduled and do not deliver notifications.
- API bearer-token authentication and workspace-scoped authorization, plus frontend login/register/logout and workspace selection on the integration branch.
- Local Docker Compose orchestration, migration runner with checksums/schema validation, and opt-in development seed data.

## Not implemented / not release-verified
- Background worker processing, queued evaluations, and scheduled alert checks. The placeholder worker has been removed from the MVP; synchronous API operations remain.
- Alert notification delivery, incident management, deployment/change correlation, distributed tracing, automated root-cause analysis, or historical failure intelligence.
- Verified model pricing configuration and real cost calculation. Cost remains unknown (`null`) when no verified price is configured; never infer unknown cost as zero.
- Production multi-instance rate limiting, complete audit logging, secret-manager integration, backup/restore and rollback runbooks, full CSRF strategy, reverse-proxy/TLS setup, production CORS settings, container image scanning, and complete request/response tracing.
- Full browser workflows against a real database/provider. The Playwright suite uses mocked API replies to exercise UI behavior; PostgreSQL tests run as a separate CI job, and live Ollama remains an explicit manual integration check.

## Local development (Windows PowerShell)

Requirements: Docker Desktop with Compose, Node.js 22, and pnpm 10.

```powershell
pnpm install --no-frozen-lockfile
Copy-Item .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. The API is exposed on `http://localhost:3001`, PostgreSQL on port 5432, and Ollama on port 11434. The API container applies migrations before starting. On a second terminal, seed synthetic local-only data with a disposable local database:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:faultlens_local_password@localhost:5432/faultlens"
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
pnpm db:seed:dev
```

The default seed credentials are for local development only. Change them in any environment that is shared or exposed. Never commit `.env` or real secrets.

## Verification commands

```powershell
pnpm --filter api test
pnpm --filter api test:hardening
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api db:test:migrate
pnpm --filter api test:integration
pnpm --filter api test:e2e
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
```

PostgreSQL integration commands require `TEST_DATABASE_URL` pointed only at a disposable database whose name contains `test`, `testing`, or `integration`. The browser Playwright suite starts Next.js locally and mocks API routes, so it does not prove real backend/database/provider integration. CI makes this distinction explicit; check the Actions results before considering a milestone verified.

## Architecture decision: no worker in MVP

Generation, evaluation, and alert evaluation remain synchronous request/response operations. The previous worker only printed a startup message and did not process jobs; its package and architecture hooks have been removed. Revisit BullMQ/Redis only when a real asynchronous workload, retries, dead-letter handling, and operational requirements are designed.

## Cost behavior

Analytics currently returns an unknown/unavailable cost unless a verified provider/model/token pricing configuration exists. Proper versioned prices, currency handling, missing-usage semantics, and associated tests are future work. A missing price is never treated as a zero cost.

## CI and release readiness

See `.github/workflows/ci.yml` and [Phase 7 release-readiness checklist](docs/roadmap/PHASE-7.md). CI runs fresh-checkout installation, API unit/hardening tests and build/lint, web lint/build, Playwright browser tests with mocked APIs, disposable PostgreSQL migration/integration tests, and dependency/secret checks. The lockfile is not yet verified with a frozen install; CI deliberately uses `pnpm install --no-frozen-lockfile` until lockfile regeneration is committed.

No public deployment should be considered safe until the outstanding controls in the Phase 7 checklist are verified.
