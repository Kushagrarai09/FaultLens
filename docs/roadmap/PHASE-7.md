# Phase 7 — Release readiness and portfolio demo

## Goal

Make the current FaultLens feature branches easier to validate, run, and demonstrate. This phase adds automated CI, safe synthetic demo data, environment-variable documentation, and a release checklist. It does not claim the application is production-secure or already deployed.

## What's included

- GitHub Actions workflow: API unit tests, API build, web lint, and web build on pull requests and pushes to `main`.
- `.env.example` documenting the database, API port, Ollama endpoint, and web-to-API proxy.
- Optional, idempotent SQL seed at `apps/api/seeds/demo_runs.sql` with synthetic run metadata and representative successes/failures.
- Release and portfolio verification checklist in this document.

## CI workflow

Workflow: `.github/workflows/ci.yml`.

The workflow currently runs:
1. pnpm dependency installation
2. API tests
3. API build
4. Web lint
5. Web build

It deliberately uses `pnpm install --no-frozen-lockfile` while the feature branches' lockfile consistency is being reconciled. Before calling this release-grade CI, regenerate and commit a consistent `pnpm-lock.yaml`, then change CI to `pnpm install --frozen-lockfile`.

A workflow file being committed does not mean the workflow has passed. Check the Actions tab and resolve all failures before merging.

## Local setup

Requirements: Node.js 22, pnpm 10, PostgreSQL, and Ollama for generation/evaluation features.

1. Clone the repository and check out the intended integration branch.
2. Install dependencies: `pnpm install`.
3. Create a PostgreSQL database named `faultlens`.
4. Copy `.env.example` to the appropriate local environment files; replace the database placeholder locally and never commit the real value.
5. Apply migrations in order:
   - `apps/api/migrations/001_create_ai_runs.sql`
   - `apps/api/migrations/002_create_prompt_evaluations.sql`
   - `apps/api/migrations/003_create_alert_rules.sql`
6. Optionally seed demo runs by running `apps/api/seeds/demo_runs.sql` against the same database.
7. Start Ollama and pull a supported model, for example `ollama pull qwen2.5:3b`.
8. Start the API in one terminal: `pnpm --filter api start:dev`.
9. Start the web app in another terminal: `pnpm --filter web dev`.
10. Open `http://localhost:3000`.

For PowerShell, set environment variables for the current terminal before starting the API:

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/faultlens"
$env:PORT = "3001"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
pnpm --filter api start:dev
```

In another terminal, configure the web proxy:

```powershell
$env:FAULTLENS_API_URL = "http://localhost:3001"
pnpm --filter web dev
```

The exact runtime must still be verified locally because the implementation branches have not yet had their full build, migration, and browser checks run.

## Demo data

The optional seed inserts eight synthetic records only when no record with provider `faultlens-demo` exists. It includes success/failure statuses, durations, token counts, and sanitized example error codes. It does not contain prompts or model responses.

Do not run the seed against a production database. To remove only these demo records:

```sql
DELETE FROM ai_runs WHERE provider = 'faultlens-demo';
```

## Deployment guidance

Deploy the web app and API as separate services and use a managed PostgreSQL instance. The web app's `FAULTLENS_API_URL` must point to the deployed API's private/internal URL where the platform supports it. Configure `DATABASE_URL`, `PORT`, and `OLLAMA_BASE_URL` as environment variables in the hosting provider's secret/configuration panel—not in source code.

Important: the current Ollama integration assumes an Ollama endpoint is reachable from the API service. A hosted API cannot reach your personal computer's `localhost:11434`. For a public demo, deploy Ollama on a reachable secured host or disable the generation/evaluation paths until a supported hosted provider adapter exists.

Do not expose the current app publicly yet. The existing API does not provide authentication or workspace authorization, and alert, prompt, dataset, evaluation, and run endpoints can mutate or reveal stored metadata. Add authentication, authorization, request limits, CORS policy, database TLS, and abuse protection before public access. Never expose an unauthenticated Ollama endpoint.

## Release checklist

- [ ] All phase branches are reviewed and integrated in dependency order.
- [ ] CI is green on the final integration branch.
- [ ] `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- [ ] Apply migrations 001–003 to a fresh PostgreSQL database successfully.
- [ ] API tests and API build pass locally.
- [ ] Web lint and web build pass locally.
- [ ] Verify run ingestion, run history, Ollama generation, prompt evaluation, and alert evaluation in the browser.
- [ ] Confirm demo seed is idempotent and that no raw prompt/response is stored by default.
- [ ] Confirm error responses do not leak secrets or database connection details.
- [ ] Set deployment secrets only in the hosting provider.
- [ ] Record a 2–3 minute walkthrough: architecture, one real generation, run history, prompt comparison, and an alert rule.
- [ ] Update the README with only features that passed verification.

## Known limitations

- This phase does not add login, workspace isolation, email/Slack notifications, a scheduler, or persisted alert history.
- No hosted deployment is created automatically by this change.
- CI and demo seed have not been executed from this authoring environment; verify them on GitHub and locally before marking the phase complete.
