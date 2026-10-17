# Phase 2 — AI observability dashboard

## Goal

Replace the default Next.js starter screen with a responsive, data-driven dashboard backed by the Phase 1 synthetic AI-run API.

## Included

- Summary cards: recent run count, success rate, average latency, and known token volume.
- Recent outcome summary and reliability snapshot.
- Search by provider, model, run ID, or error code.
- Filter runs by all, success, or failure.
- Refresh, loading, empty, and recoverable error states.
- A button that creates a synthetic demo run through the API.
- A same-origin Next.js route handler that proxies requests to the API.
- Responsive layout and a privacy reminder. Prompts and model responses are not collected.

## Architecture

```text
Browser
  | GET /api/runs?limit=50&offset=0  / POST /api/runs
  v
Next.js route handler (same origin)
  | forwards to FAULTLENS_API_URL
  v
NestJS API (:3001)
  v
PostgreSQL (ai_runs)
```

The dashboard summarizes only the latest 50 records returned by the API. These are not all-time metrics. Cost is intentionally omitted because provider-specific pricing has not been implemented or verified.

## Local setup

1. Complete Phase 1 prerequisites: install workspace dependencies, start PostgreSQL, and apply `apps/api/migrations/001_create_ai_runs.sql`.
2. Configure `DATABASE_URL` in the API terminal.
3. Start the API on port 3001. The API default is set to 3001 so it does not conflict with Next.js on port 3000.
4. In a second terminal, run `pnpm --filter web dev`.
5. Open `http://localhost:3000`.
6. Set `FAULTLENS_API_URL` if the API is hosted somewhere other than `http://localhost:3001`.

PowerShell API terminal:

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@localhost:5432/faultlens"
pnpm --filter api start:dev
```

Web terminal:

```powershell
pnpm --filter web dev
```

## Limitations

- The Phase 1 API, PostgreSQL database, and migration must be working for live records to appear.
- The demo button writes synthetic records; it does not call an AI model.
- Metrics only cover the latest 50 loaded records.
- No automatic polling, authentication, cost calculations, prompt evaluation, or real-provider integration yet.
- Dependency installation, build, and browser checks still need to run locally before merging.

## Acceptance checklist

- [ ] Web app builds successfully.
- [ ] API and web app run concurrently on ports 3001 and 3000.
- [ ] Dashboard loads existing database records.
- [ ] Empty state works with an empty database.
- [ ] Demo button creates a record and refreshes the list.
- [ ] Search and status filters work.
- [ ] API/database downtime is shown as a recoverable error.
- [ ] Layout is usable on desktop and mobile.
- [ ] No prompt or response text is sent or displayed.
