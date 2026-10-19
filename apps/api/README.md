# FaultLens API

The FaultLens API is a NestJS application that powers the FaultLens prototype: AI-run ingestion and history, Ollama generation, token/latency analytics, prompt versions, evaluation datasets and comparisons, and threshold-based reliability alerts.

> **Status:** MVP/prototype. Authentication and workspace authorization are not implemented. Do not expose this API to the public internet or use it with sensitive data.

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

Never commit `.env` or real credentials. The web app's optional `FAULTLENS_API_URL` setting is documented in `apps/web/.env.example`.

## Install dependencies

Run at the repository root:

```bash
pnpm install --frozen-lockfile
```

Using the frozen lockfile ensures installation fails instead of silently updating dependency resolution when the lockfile and manifests disagree.

## Prepare PostgreSQL

Create an empty `faultlens` database and apply the SQL migrations **in numeric order**:

1. `apps/api/migrations/001_create_ai_runs.sql`
2. `apps/api/migrations/002_create_prompt_evaluations.sql`
3. `apps/api/migrations/003_create_alert_rules.sql`

For example, with PostgreSQL's `psql` client:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/migrations/001_create_ai_runs.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/migrations/002_create_prompt_evaluations.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/migrations/003_create_alert_rules.sql
```

PowerShell can use the same commands if `psql` is installed and `DATABASE_URL` is available as an environment variable. The API currently assumes the schema exists; migrations are not automatically applied on startup. Do not run these against a database containing important data without reviewing the SQL first.

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

- No authentication, workspace isolation, RBAC, or user authorization.
- SQL migrations must be applied manually.
- Worker is a placeholder.
- Alert evaluation is not continuous or scheduled.
- End-to-end and browser integration coverage is incomplete.
- Token-based estimated cost is not implemented.
- Do not expose the API publicly until security controls are implemented and verified.
