# Phase 7 — Release readiness and portfolio demo

## Goal

Prepare the implemented phases for reproducible verification. This change improves source-level tests and documentation; it does not claim CI, migrations, builds, or browser workflows have passed.

## Current implementation

The feature branches contain run ingestion and history, an Ollama generation route, all-time analytics, versioned prompts and datasets, prompt evaluation, and on-demand reliability-rule evaluation. These capabilities remain **unverified until checks pass on an integrated branch**.

## CI checks

Workflow: `.github/workflows/ci.yml`. It runs API tests, API build, web lint, and web build on pull requests and pushes to main. The install step currently uses `pnpm install --no-frozen-lockfile` because the checked-in lockfile has not been regenerated from all current package manifests. Do not switch CI to frozen install until pnpm can regenerate the lockfile and that exact install succeeds from a clean checkout.

## Local setup checklist (for the integration pass)

Requirements: Node.js 22, pnpm 10, PostgreSQL, and Ollama for model generation/evaluation.

1. Clone the repository and select the integration branch after its stacked PRs are reviewed and integrated in dependency order.
2. Run `pnpm install`.
3. Create a PostgreSQL database named `faultlens`.
4. Set `DATABASE_URL` and `PORT=3001` in the API terminal; set `OLLAMA_BASE_URL=http://localhost:11434` for generation/evaluation.
5. Apply migrations in order: `001_create_ai_runs.sql`, `002_create_prompt_evaluations.sql`, `003_create_alert_rules.sql`.
6. Optionally run `apps/api/seeds/demo_runs.sql` on the local development database only.
7. Start Ollama and pull `qwen2.5:3b` (or another model installed locally).
8. Start API with `pnpm --filter api start:dev`.
9. In a second terminal set `FAULTLENS_API_URL=http://localhost:3001` and start web with `pnpm --filter web dev`.
10. Open `http://localhost:3000`.

PowerShell example for the API terminal:

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/faultlens"
$env:PORT = "3001"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
pnpm --filter api start:dev
```

In the web terminal:

```powershell
$env:FAULTLENS_API_URL = "http://localhost:3001"
pnpm --filter web dev
```

## Privacy and security

- AI-run generation stores metadata only (provider/model, status, duration, token counts, sanitized error code); raw generation prompts and responses are not saved to `ai_runs`.
- Prompt templates and evaluation datasets/cases are stored intentionally because they are the artifact being evaluated. Treat them as potentially sensitive and use synthetic data while developing.
- Current app has no authentication or workspace authorization. Do **not** expose the app or API publicly until access controls and abuse protections exist.
- Do not commit `.env`, API credentials, database connection strings, or provider secrets.
- Use a secured, reachable Ollama endpoint for hosted use; `localhost:11434` on a hosted API refers to that service's own container, not your personal computer.

## Demo seed

Optional seed inserts synthetic rows marked `provider='faultlens-demo'`; run only against a local development database. Remove them with:

```sql
DELETE FROM ai_runs WHERE provider = 'faultlens-demo';
```

## Remaining release verification

- [ ] CI passes on the integrated branch.
- [ ] `pnpm install --frozen-lockfile` passes after lockfile regeneration.
- [ ] Apply all three migrations to a clean PostgreSQL database.
- [ ] Verify run persistence across an API restart.
- [ ] Verify real Ollama generation, token counts, timeout/unavailable handling.
- [ ] Verify analytics against hand-calculated fixtures and ensure unknown usage remains unknown.
- [ ] Verify prompt creation/versioning and fair comparison with the same dataset.
- [ ] Verify alert rules against controlled sample runs and an empty time window.
- [ ] Run browser checks on overview, analytics, evaluations, and alerts.
- [ ] Review dependency security, secret scanning, access controls, and request-size limits before public deployment.
- [ ] Record a short walkthrough after the above checks pass.

No local runtime or browser testing was performed by the repository-editing connector. Mark every check only after gathering evidence from CI or local execution.
