# Phase 1 — Synthetic AI-run ingestion API

## Goal

Accept synthetic AI-run metadata, validate it, persist it in PostgreSQL, and retrieve it through a small REST API. No real model provider, dashboard, Redis, or worker job is required in this phase.

## Data model

The `ai_runs` table stores only request metadata:

- `id`: server-generated UUID
- `provider`, `model`
- `status`: `success` or `failure`
- `duration_ms`
- `input_tokens`, `output_tokens`: nullable when unavailable
- `error_code`: optional, sanitized error identifier
- `started_at`, `created_at`

Raw prompts and model responses are intentionally excluded.

## API

### `POST /api/runs`

Example body:

```json
{
  "provider": "demo-provider",
  "model": "demo-model",
  "status": "success",
  "durationMs": 420,
  "inputTokens": 12,
  "outputTokens": 34,
  "startedAt": "2026-10-17T12:00:00.000Z"
}
```

Returns the created record, including the generated `id` and `createdAt`.

A failed run can use `"status": "failure"` and an optional `errorCode`. Do not send raw prompt/response text or secrets.

### `GET /api/runs?limit=20&offset=0`

Returns records newest first, plus pagination metadata. `limit` is 1–100; `offset` is 0 or greater.

### `GET /api/runs/:id`

Returns one run by UUID. Invalid UUIDs return 400; unknown IDs return 404.

### `GET /`

Retains the simple service greeting for the initial baseline.

## Local database setup

1. Create a PostgreSQL database.
2. Set `DATABASE_URL` for the API process, for example `postgresql://postgres:YOUR_PASSWORD@localhost:5432/faultlens`.
3. Apply `apps/api/migrations/001_create_ai_runs.sql` to that database using your preferred PostgreSQL client.
4. Install dependencies after the `pg` dependency has been added: `pnpm install`.
5. Start the API with `pnpm --filter api start:dev`.

The API can start without `DATABASE_URL`, but database-backed endpoints return 503 until a database is configured and the migration has been applied.

## Validation and safety

- Reject invalid body types, empty provider/model names, unsupported statuses, invalid dates, negative token counts, and unreasonable durations.
- Use parameterized SQL queries.
- Do not persist raw prompts or model responses.
- Return a generic database error rather than leaking connection details.
- Do not estimate cost in Phase 1.

## Phase 1 acceptance checklist

- [ ] API builds and starts.
- [ ] Migration creates the table and indexes.
- [ ] Valid synthetic records can be created and retrieved.
- [ ] Invalid payloads are rejected with 400.
- [ ] List endpoint supports bounded pagination.
- [ ] Invalid UUIDs return 400 and missing records return 404.
- [ ] Records remain available after an API restart.
- [ ] Unit and API integration tests pass.
- [ ] README includes verified setup and API instructions.
