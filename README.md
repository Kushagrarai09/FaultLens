# FaultLens

**An AI observability and prompt-evaluation MVP for developers building AI-powered applications.**

FaultLens helps developers inspect the reliability and performance of AI calls. It records operational metadata (status, provider/model, duration, and available token counts), lets teams compare prompt versions against repeatable datasets, and evaluates reliability thresholds for a selected workspace.

> **Release status: prototype, not production-ready.** Builds do not prove real database/provider behavior or browser workflows. Review CI and the Phase 7 checklist before treating any feature as verified or exposing the service publicly.

## What problem does FaultLens solve?

When an application calls an LLM, developers need to answer practical questions: Which requests failed? Which models are slow? Is token usage available? Did a prompt edit improve a test set? Are failure-rate or latency thresholds being crossed? FaultLens brings these questions into one small self-hostable dashboard.

## How it works

1. **Capture AI-run metadata.** The NestJS API validates run records and persists them in PostgreSQL. The app stores run status, provider/model, duration, token usage when known, and sanitized error codes. It does not write raw generation prompts or returned model text to AI-run history.
2. **Call a local model with Ollama.** The generation endpoint sends a request to a configured Ollama service, returns the generated text to the caller, and records operational metadata.
3. **Explore run health.** The Next.js dashboard displays recent runs, status, latency, and known token usage. Analytics summarizes workspace-scoped totals, latency percentiles, and token counts.
4. **Evaluate prompt changes.** Users create prompt templates and immutable versions, assemble datasets/cases, and compare selected versions against the same examples. The current score is a simple word-overlap heuristic, not semantic correctness.
5. **Evaluate reliability thresholds.** Users define thresholds for failure rate, P95 latency, or failed-run count and manually run evaluations against stored metadata. Evaluation is on-demand only; there is no scheduler or alert delivery.

## Implemented MVP (source-level; verify through CI/runtime checks)

- PostgreSQL-backed AI-run metadata, history, retrieval, and pagination.
- Ollama-backed generation with bounded upstream timeout and metadata-only persistence.
- Per-workspace run, latency, and token analytics.
- Prompt templates/version history, reusable evaluation datasets/cases, and comparison results.
- Manual threshold-based reliability rules.
- API bearer authentication, role checks, workspace-scoped data access, and frontend login/register/logout/session-cookie/workspace selection flows on the integration branch.
- Local Docker Compose orchestration, checksum-tracked migration runner, schema validation, and explicitly opted-in development seed data.
- Playwright browser tests with mocked API responses, plus separate PostgreSQL integration/API e2e CI jobs.

## Not implemented or not release-verified

- Background worker/queue processing. The placeholder worker was removed from the MVP; generation, prompt comparison, and alert evaluation are synchronous. Reconsider Redis/BullMQ only when a real background workload requires retry/backoff, dead-letter handling, health checks, and operational support.
- Scheduled alert evaluation, email/Slack/webhook notifications, incident management, deployment/change correlation, distributed tracing, automated root-cause analysis, or historical failure intelligence.
- Verified real cost calculation. Analytics returns unavailable/unknown cost (`null`) when no verified provider/model price and reliable usage information are configured. Missing cost is not zero.
- Production multi-instance rate limiting, complete security audit logs, secret-manager integration, dependency-health metrics, full tracing, tested backup/restore and migration rollback procedures, complete CSRF/session review, reverse-proxy/TLS configuration, production CORS policy, and container image scanning.
- Live Ollama validation and full end-to-end browser tests against a real database/provider. Browser tests mock API routes; PostgreSQL integration is tested separately in CI.

## Project structure

```text
FaultLens/
├── apps/
│   ├── web/                         # Next.js dashboard and browser tests
│   │   ├── src/app/                 # Overview, login/register, analytics, evaluations, alerts, API proxies
│   │   ├── src/components/          # Session provider, account/workspace menu
│   │   ├── src/lib/                 # Server-side API proxy/session cookie helpers
│   │   ├── e2e/                      # Playwright browser journeys (API mocked)
│   │   └── playwright.config.ts
│   └── api/                         # NestJS API
│       ├── src/                     # Auth, workspaces, runs, Ollama, analytics, prompts, alerts, health
│       ├── migrations/              # Numbered PostgreSQL schema migrations
│       ├── scripts/                 # Migration, seed, test-database safety helpers
│       └── test/                    # PostgreSQL integration and API e2e suites
├── docs/roadmap/                    # Phase plans, verification and release checklist
├── .github/workflows/ci.yml         # Unit, lint/build, PostgreSQL, browser, security jobs
├── docker-compose.yml               # Local PostgreSQL, Ollama, API, and web
├── .env.example                     # Safe configuration template
├── package.json                     # Root dev, migration, seed and quality scripts
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

## Local setup — Windows PowerShell

### Prerequisites

Install Docker Desktop with Compose, Node.js 22, and pnpm 10. Docker Desktop is required for the bundled PostgreSQL/Ollama/API/web setup. For real generation, Ollama must have a model downloaded.

### Start the services

Run these commands from the repository root:

```powershell
pnpm install --no-frozen-lockfile
Copy-Item .env.example .env
docker compose up --build
```

Then open:

| Service | Local address | Purpose |
|---|---|---|
| Web | http://localhost:3000 | Dashboard and login/register |
| API | http://localhost:3001 | NestJS REST API |
| PostgreSQL | localhost:5432 | Persistent metadata and evaluation data |
| Ollama | http://localhost:11434 | Local model generation |

The Compose API service waits for PostgreSQL health, applies the numbered migrations before listening, and exposes a liveness health check. Stop the stack with `Ctrl+C`; use `docker compose down` to stop services, and `docker compose down -v` only when you intentionally want to delete local persisted volumes.

### Seed local sample data

Open a second PowerShell terminal at the repo root. Use only for a disposable local development database:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:faultlens_local_password@localhost:5432/faultlens"
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
pnpm db:seed:dev
```

The seed creates a local user/workspace plus synthetic runs, prompt/version, and evaluation cases. Follow the seed script's printed account details. Change example credentials before using any shared environment. Never commit `.env`, passwords, tokens, or provider secrets.

### Stop and inspect services

```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
```

## Run tests and checks

Run from the repository root:

```powershell
# API unit and hardening tests
pnpm --filter api test
pnpm --filter api test:hardening
pnpm --filter api lint
pnpm --filter api build

# Web checks
pnpm --filter web lint
pnpm --filter web build

# Playwright browser flows (API endpoints are mocked)
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

For PostgreSQL integration tests, point `TEST_DATABASE_URL` at a disposable database whose database name contains `test`, `testing`, or `integration`; the test migration helper intentionally refuses other databases:

```powershell
$env:TEST_DATABASE_URL = "postgresql://faultlens:YOUR_TEST_PASSWORD@localhost:5432/faultlens_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:AUTH_TOKEN_SECRET = "integration-only-secret-do-not-use-outside-tests-32chars"
pnpm --filter api db:test:migrate
pnpm --filter api test:integration
pnpm --filter api test:e2e
```

Do not set `TEST_DATABASE_URL` to a development or production database: the integration suite resets tables between tests. The browser suite uses API mocks and does not replace PostgreSQL or live Ollama verification. CI uses a PostgreSQL service for database-backed checks, and has a separate step documenting that live Ollama is not exercised by mocked jobs.

## Security and release status

- API authorization and workspace scoping must still be reviewed and verified; a UI hiding a control is not security enforcement.
- The API rate limiter is currently in-memory and unsuitable for multiple API replicas.
- Use synthetic prompt/evaluation data during development. Prompt templates and test cases are intentionally stored; raw generated prompts/responses are not stored in AI-run history.
- Review `docs/roadmap/PHASE-7.md` before exposure. No public deployment should be considered safe until production controls, independent security review, backup/restore, migration recovery, TLS/proxy and CORS setup, auditability, and all required CI checks are verified.
