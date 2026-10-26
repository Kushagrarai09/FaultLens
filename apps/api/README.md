# FaultLens API

NestJS API for AI-run metadata/history, Ollama generation, workspace-scoped analytics, prompt versioning/evaluation, and on-demand reliability alerts.

> **Status:** MVP/prototype, not production-ready. Frontend authentication and workspace UX exist on the current integration branch, but require CI/browser verification and independent security review. Rate limiting is in-memory and single-instance only.

## Requirements and configuration

- Node.js 22 and pnpm 10.34.7
- PostgreSQL; Ollama for real generation/evaluation
- `DATABASE_URL`, `AUTH_TOKEN_SECRET` (random secret of at least 32 characters), `PORT`, `OLLAMA_BASE_URL`
- Never commit `.env`, access tokens, or database credentials.

## Local PostgreSQL migrations

Run the production/development migration command against the configured database:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:password@localhost:5432/faultlens"
pnpm --filter api db:migrate
```

The migration runner applies SQL files in numeric order, records SHA-256 checksums in `faultlens_schema_migrations`, takes a PostgreSQL advisory lock, rejects changed applied migrations, and checks required tables. The API refuses to start if the schema is missing required tables. Review SQL before applying it to any database with important data.

Do not use `db:test:migrate` for development or production. The script `scripts/migrate-test-db.mjs` is restricted to disposable database names containing `test`, `testing`, or `integration`.

## Development seed

Only for disposable local development:

```powershell
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
$env:DEV_SEED_EMAIL = "local@faultlens.test"
$env:DEV_SEED_PASSWORD = "replace-with-a-local-password"
pnpm --filter api db:seed:dev
```

The seed creates a local user/workspace, sample runs, a prompt/version, and evaluation data. It refuses production mode and requires explicit opt-in. Never use example credentials for any exposed/shared environment.

## Tests

```powershell
pnpm --filter api test
pnpm --filter api test:hardening
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api db:test:migrate
pnpm --filter api test:integration
pnpm --filter api test:e2e
```

Set `TEST_DATABASE_URL` to a disposable test database before integration tests; the test migration utility validates the database name and schema. CI's PostgreSQL service performs migration validation and integration tests against an isolated database. Browser tests are in `apps/web/e2e` and stub backend routes; those tests are not a substitute for live PostgreSQL or Ollama verification.

## MVP capabilities and limitations

Implemented: AI-run metadata, Ollama generation, token/latency summaries, versioned prompts, evaluation datasets/comparisons, manual threshold alerts, authentication, and workspace-scoped API authorization (subject to tests/security review).

Not implemented or not verified: worker/queue processing, scheduled alerts, notification delivery, incident management, distributed tracing, deployment correlation, automated root-cause analysis, historical failure intelligence, and verified real-cost calculation. Cost stays unknown when verified pricing is missing. There is no production-ready distributed rate limiter, complete audit/secret management, backup/restore and rollback runbook, full CSRF strategy, reverse-proxy/TLS config, or complete tracing. Keep the app private until release checks pass.


## Browser test suite

The Playwright suite is maintained in `apps/web/e2e/app.spec.ts` and configured by `apps/web/playwright.config.ts`. It exercises login success/failure, registration, logout, unauthenticated dashboard redirect, dashboard loading, synthetic run creation, analytics, evaluations, alerts, API-unavailable messaging, and workspace switching. These browser tests intercept `/api/**` requests with deterministic test responses; they verify frontend interaction and routing, not the real API/database security boundary.

Run locally on Windows PowerShell:

```powershell
pnpm install --no-frozen-lockfile
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

CI installs Chromium with OS dependencies and runs the browser suite separately from PostgreSQL migration/integration tests. The API e2e test command runs against the disposable PostgreSQL service in CI. Live Ollama is not required for mocked browser/API flows and remains a separately documented manual integration check.
