# FaultLens API

The FaultLens API is a NestJS application that powers the FaultLens prototype: AI-run ingestion and history, Ollama generation, token/latency analytics, prompt versions, evaluation datasets and comparisons, and threshold-based reliability alerts.

> **Status:** MVP/prototype. Bearer authentication, workspace scoping, and basic API hardening are implemented on feature branches; run the full tests and review CI before merging. The in-memory limiter is single-instance only. Do not treat the application as production-ready yet.

## Requirements

- Node.js 22 (use the version configured in CI)
- pnpm 10.34.7
- PostgreSQL
- Ollama for generation and prompt-evaluation workflows

## Configure the environment

From the repository root, copy the root template to `.env` and replace the local database password:

```bash
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

Set at least:

- `DATABASE_URL`: PostgreSQL connection string for the FaultLens database.
- `PORT`: API port (defaults to `3001` in the template).
- `OLLAMA_BASE_URL`: Ollama endpoint; defaults to `http://localhost:11434`.
- `AUTH_TOKEN_SECRET`: a cryptographically random secret of at least 32 characters; never use the example placeholder in a real environment.

Never commit `.env` or real credentials. The web app's optional `FAULTLENS_API_URL` setting is documented in `apps/web/.env.example`.

## Install dependencies

Run at the repository root:

```bash
pnpm install --frozen-lockfile
```

Using the frozen lockfile ensures installation fails instead of silently updating dependency resolution when the lockfile and manifests disagree.

## Prepare PostgreSQL

Create an empty `faultlens` database and run the migration runner:

1. `apps/api/migrations/001_create_ai_runs.sql`
2. `apps/api/migrations/002_create_prompt_evaluations.sql`
3. `apps/api/migrations/003_create_alert_rules.sql`
4. `apps/api/migrations/004_create_auth_workspaces.sql`

The runner applies migrations in numeric order, records SHA-256 checksums in
`faultlens_schema_migrations`, refuses to continue if an applied migration was
edited, takes a PostgreSQL advisory lock, and validates all required tables:

```bash
pnpm --filter api db:migrate
```

PowerShell example:

```powershell
$env:DATABASE_URL = "postgresql://faultlens:password@localhost:5432/faultlens"
pnpm --filter api db:migrate
```

The API also checks the required schema before listening and reports the exact
migration command when tables are missing. Compose runs this migration command
automatically before starting the API. Review migrations before applying them
to an existing database.

## Local development seed

After migrations, create a deterministic local account and synthetic data:

```powershell
$env:NODE_ENV = "development"
$env:ALLOW_DEVELOPMENT_SEED = "true"
$env:DEV_SEED_EMAIL = "local@faultlens.test"
$env:DEV_SEED_PASSWORD = "faultlens-local-password"
pnpm --filter api db:seed:dev
```

The seed is idempotent for the configured email/workspace and creates sample
AI runs, one prompt/version, and a two-case evaluation dataset. It refuses to
run in production or unless `ALLOW_DEVELOPMENT_SEED=true` is explicitly set.

## PostgreSQL integration tests

The database integration suite uses a separate, disposable PostgreSQL database. The runner **refuses to run** if the database name does not contain `test`, `testing`, or `integration`, because the suite truncates its test tables.

Example PowerShell setup (use a dedicated local database called `faultlens_test`):

```powershell
$env:TEST_DATABASE_URL = "postgresql://faultlens:YOUR_TEST_PASSWORD@localhost:5432/faultlens_test"
$env:DATABASE_URL = $env:TEST_DATABASE_URL

$env:AUTH_TOKEN_SECRET = 'integration-only-secret-do-not-use-outside-tests-32chars'

# Apply the four migrations, verify checksums, and validate the required tables.
pnpm --filter api db:test:migrate

# Run API integration tests against PostgreSQL using Supertest.
pnpm --filter api test:integration
```

Run the same commands with a disposable PostgreSQL instance through Docker or another local PostgreSQL service. Do not point `TEST_DATABASE_URL` at your usual development database or any production database. The integration suite truncates its tables between tests.

The integration checks cover:
- AI run persistence, history and retrieval.
- Analytics calculated from persisted token and latency records.
- Prompt templates/versions and dataset creation, with comparison results persisted even when Ollama is unavailable.
- Alert-rule persistence and evaluation against recorded runs.
- A sanitized HTTP 503 response when PostgreSQL is unreachable.

The prompt-comparison integration test deliberately points Ollama to a closed local port; it tests durable error-result storage without requiring a live model. It does not verify successful real-model generation.

## API hardening configuration

The API boot validates `AUTH_TOKEN_SECRET`, `DATABASE_URL`, `PORT`, request timeout and body-size settings, allowed CORS origins, rate limits, dependency URLs, and PostgreSQL timeout/pool settings. It refuses to start if a required setting is invalid.

| Setting | Default | Purpose |
|---|---:|---|
| `API_BODY_LIMIT_BYTES` | `262144` | JSON and URL-encoded body limit |
| `API_REQUEST_TIMEOUT_MS` | `65000` | Server request timeout |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated exact allowed origins |
| `API_RATE_LIMIT_MAX` | `120` | Requests per IP/user in the default window |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | Default rate window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Login/registration attempts in the auth window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` | Auth rate window |
| `GENERATION_RATE_LIMIT_MAX` | `20` | Model generation requests in its window |
| `GENERATION_RATE_LIMIT_WINDOW_MS` | `60000` | Generation rate window |
| `PG_POOL_MAX` | `10` | Maximum PostgreSQL pool size |
| `PG_CONNECT_TIMEOUT_MS` | `2000` | PostgreSQL connection timeout |
| `PG_IDLE_TIMEOUT_MS` | `30000` | PostgreSQL idle connection timeout |
| `PG_QUERY_TIMEOUT_MS` | `5000` | Driver query timeout |
| `PG_STATEMENT_TIMEOUT_MS` | `5000` | PostgreSQL statement timeout |
| `PG_HEALTH_TIMEOUT_MS` | `1000` | PostgreSQL health-check query timeout |
| `OLLAMA_HEALTH_TIMEOUT_MS` | `2000` | Ollama health request timeout |

`GET /health/live` is a liveness check that does not contact dependencies. `GET /health/ready` checks PostgreSQL and Ollama and returns HTTP 503 if either dependency is unavailable. The process can stay alive when PostgreSQL is down so the probe can distinguish liveness from readiness. Readiness currently requires both dependencies even for application routes that do not generate text.

The application emits single-line JSON logs containing request ID, method, path (without query string), status and duration. Request bodies are not logged; inline bearer tokens and credentials embedded in URLs are redacted. Generic API errors are returned without stack traces or internal provider/database details. `X-Request-Id` is returned for support and correlation.

The request-size and server-timeout controls use Express/Node HTTP settings. The in-memory fixed-window rate limiter is suitable only for one API process; it does not share counters between replicas and should be replaced with Redis-backed limiting before horizontally scaled production deployment. Exact CORS origins must be configured for the deployed web origin; do not add wildcards.

Run hardening-focused tests with:

```bash
pnpm --filter api test:hardening
pnpm --filter api build
```

These tests cover limiter behavior, dependency failures, health endpoints, and error/log redaction. They do not replace deployment-level load testing, a security review, or tests against the exact production proxy/network setup.

## Authentication and workspace authorization

Except for `GET /`, registration, and login, the API data endpoints require an `Authorization: Bearer <accessToken>` header. Generate a random secret for `AUTH_TOKEN_SECRET` before testing authenticated routes. Access tokens expire after one hour. The API verifies both the token signature and current workspace membership on every protected request; membership roles are read from PostgreSQL rather than trusted from token claims.

Key endpoints:

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/register` | Public; creates a user and first owner workspace |
| POST | `/api/auth/login` | Public; accepts email, password, and optional workspaceId |
| GET | `/api/auth/me` | Authenticated |
| POST | `/api/auth/switch-workspace` | Authenticated member |
| GET | `/api/workspaces` | Authenticated member |
| POST | `/api/workspaces` | Authenticated; creates a new workspace and returns its session |
| GET | `/api/workspaces/members` | Current workspace member |
| POST | `/api/workspaces/members` | Owner/admin; adds an already registered user by email |

The Next.js web app provides `/login` and `/register`, stores the access token
in an HTTP-only `faultlens_session` cookie, and forwards that cookie as a bearer
token through its server-side API proxy routes. The token is not stored in
`localStorage`. The dashboard loads the current user and available workspaces
from the API, supports workspace switching, and provides sign out. Invalid or
expired sessions redirect back to `/login`.

Register a workspace owner:

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.test","password":"use-a-long-unique-password","workspaceName":"My Workspace"}'
```

Use the returned `accessToken` as a bearer token for API calls. Passwords are stored as salted scrypt hashes, never plaintext. Workspace roles are `owner`, `admin`, `member`, and `viewer`; viewers can read workspace data but cannot create or modify resources. Owners/admins can add existing users; admins cannot grant admin or owner privileges.

Migration 004 assigns old data to an unassigned “Legacy data” workspace that has no members, rather than making historical data visible to newly registered users. That data remains inaccessible until an explicit, reviewed ownership-recovery process is implemented. Back up your database and inspect migration 004 before applying it to an existing installation.

The current Next.js UI is not yet a complete sign-in experience and must be updated to register/login and forward bearer tokens to protected API routes before the whole application can be used as a multi-user product. Other production requirements—such as rate limiting, credential recovery, email verification, audit logging, monitoring, and security review—are not covered by this phase.

## Start the API

From the repository root:

```bash
pnpm --filter api dev
```

The API defaults to port `3001` through the example configuration. Start Ollama separately and ensure the configured model is available before trying generation or evaluations.

## Verification commands

Run these from the repository root:

```bash
# Deterministic API unit tests
pnpm --filter api test

# Current API end-to-end test (limited: checks the root route only)
pnpm --filter api test:e2e

# API static analysis
pnpm --filter api lint

# API production build
pnpm --filter api build

# Build every workspace package, including the worker and web app
pnpm build
```

The root commands are also available:

```bash
pnpm test
pnpm lint
pnpm build
```

The worker currently only logs a startup message; it does not process queued work. Passing builds and unit tests are not evidence of full production readiness. The current end-to-end test does not validate PostgreSQL persistence, Ollama generation, prompt evaluation, analytics, or browser flows.

## Implemented API areas

The NestJS controllers are organized by feature:

- **Runs:** run ingestion, generation, and history.
- **Analytics:** latency and token usage aggregates. Cost remains unavailable unless pricing is implemented/configured.
- **Evaluations:** prompt templates and versions, datasets/cases, comparisons, and evaluation history.
- **Alerts:** threshold rules and manual evaluation.

Inspect the corresponding controller files under `apps/api/src/` for current route definitions and request/response shapes. Routes may change while the project is an MVP.

## Known limitations

- Authentication and workspace-scoped API checks are implemented, but have not yet received a formal security review.
- SQL migrations are applied with `pnpm --filter api db:migrate`; the API refuses to start against an incomplete schema.
- Worker is a placeholder.
- Alert evaluation is not continuous or scheduled.
- End-to-end and browser integration coverage is incomplete.
- Token-based estimated cost is not implemented.
- Do not expose the API publicly until the remaining production controls are implemented and independently verified.
