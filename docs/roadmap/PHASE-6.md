# Phase 6 — Reliability alerts

## Goal
Provide a small, understandable alerting layer on existing AI-run metadata. Developers can define threshold rules and evaluate them against recent traffic without introducing Redis, a queue, or an external monitoring service.

## Supported metrics
- `failure_rate_percent`: alert when failure rate in the configured time window is greater than or equal to the threshold (0–100).
- `p95_latency_ms`: alert when the 95th-percentile request duration meets or exceeds the threshold.
- `failed_runs`: alert when the number of failed runs in the window meets or exceeds the integer threshold.

Window size is 5–1440 minutes. Evaluation looks at `ai_runs.created_at`. No runs in the window returns `insufficient_data`, not a false green state. A rule can be enabled or disabled. Evaluation is on demand; this phase does not send email, Slack, SMS, or background notifications.

## API
- `GET /api/alerts/rules`
- `POST /api/alerts/rules`: `{ "name": "Elevated failures", "metric": "failure_rate_percent", "threshold": 10, "windowMinutes": 15 }`
- `PATCH /api/alerts/rules/:id`: `{ "enabled": false }`
- `POST /api/alerts/evaluate`: evaluate all enabled rules against current recent traffic.

Example rules:
- Failure rate > threshold: metric `failure_rate_percent`, threshold `10`, windowMinutes `15`.
- Slow tail latency: metric `p95_latency_ms`, threshold `2500`, windowMinutes `30`.
- Multiple failures: metric `failed_runs`, threshold `3`, windowMinutes `10`.

The implementation triggers at >= threshold. Rule evaluation returns the current status and observed value; it does not persist a separate alert-event history. This keeps the MVP small and avoids implying notifications have been sent.

## Dashboard
Open `http://localhost:3000/alerts` after starting PostgreSQL, API, and web. Create rules, run an evaluation, inspect triggered/normal/insufficient-data states, and enable or disable rules.

## Database setup
Apply `apps/api/migrations/003_create_alert_rules.sql` after the Phase 1 migration. It adds `alert_rules` and an index on `ai_runs.created_at`; it does not change existing run records.

## Privacy and limitations
- Uses metadata only: status, duration, and timestamps.
- Does not store prompts or responses.
- Evaluations are manual/on-demand, not continuous monitoring. No external notifications are sent.
- These endpoints currently have no authentication or workspace-level access controls; do not expose the app publicly without adding authentication and authorization.
- Keep the PR in draft until API tests/build, web build, migration, and browser checks pass.
