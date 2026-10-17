# FaultLens

**A phased AI observability and prompt-evaluation platform.**

FaultLens is being built to help developers understand how AI-powered features behave: which requests succeed or fail, how long they take, how much token usage they incur, and how prompt changes affect quality, latency, and estimated cost.

> **Project status:** Early development. Phase 1 API and Phase 2 dashboard are implemented on feature branches, but still require local dependency installation, builds, database checks, and browser verification before they can be considered complete. The dashboard displays the latest 50 stored run records and can create synthetic demo runs; it does not call a real AI provider yet.

## Why FaultLens?

Connecting an application to an AI model is only the first step. Developers also need to answer practical questions:

- Which AI requests failed, and when?
- Which requests are slow?
- How much token usage did requests consume?
- What is the estimated cost, when reliable usage and pricing data are available?
- Did a new prompt improve results, or did it increase latency and cost?

FaultLens aims to make these questions answerable from one small, understandable dashboard.

## MVP: Three core capabilities

### 1. AI request monitoring
- Browse request history and outcomes.
- Inspect model name, duration, and available token usage.
- View request details without exposing sensitive content by default.

### 2. Cost and performance analytics
- Summarize total, successful, and failed requests.
- Calculate average latency and useful latency percentiles.
- Summarize available token usage.
- Estimate cost only when the required usage data and documented pricing are available; otherwise show it as unknown.

### 3. Prompt versioning and evaluation
- Save and identify prompt versions.
- Build a small dataset of representative test inputs.
- Run the same dataset against different prompt versions.
- Compare evaluation scores, failures, latency, and estimated cost.

Prompt comparison is intended to be FaultLens's key differentiator: help developers make evidence-based decisions about prompt quality instead of relying only on manual spot checks.

## Planned architecture

FaultLens will remain a **simple monorepo and modular application** for the MVP. We are not starting with microservices.

```text
AI application / test runner
          |
          v
     FaultLens API  <---->  One AI model provider
       (NestJS)
          |
          v
      PostgreSQL
          ^
          |
   Next.js dashboard

TypeScript worker: retained for future background jobs;
not required for the first synchronous MVP workflow.
```

### Technology choices

| Component | Planned role |
|---|---|
| Next.js + TypeScript | Dashboard and request/evaluation views |
| NestJS + TypeScript | API, validation, provider integration, and application logic |
| PostgreSQL | Persistent AI-run records, prompt versions, datasets, and evaluation results |
| One AI provider | First real model integration after synthetic request tracking works |
| TypeScript worker | Reserved for background processing when it becomes necessary |
| Tests | Verify validation, persistence, provider error handling, evaluation, and key user flows |

The existing repository already has the frontend, API, and worker starter structure. Database persistence, the real AI integration, dashboard workflows, and prompt evaluation still need to be implemented and verified.

## Development roadmap

We will build one working milestone at a time. A phase is complete only when its behavior has been tested and documented.

| Phase | Goal | Expected result |
|---|---|---|
| 0. Repository baseline | Run the existing apps, inspect scripts/configuration, and record current behavior | Reproducible local setup |
| 1. Request ingestion | Define and validate synthetic AI-run records; add PostgreSQL persistence and retrieval APIs | Runs can be stored and retrieved |
| 2. Dashboard | Connect the Next.js interface to the API and show history, outcomes, latency, and details | A usable dashboard backed by real stored data |
| 3. Real AI integration | Integrate one provider and record actual outcomes, duration, and available usage | Real model calls appear in run history |
| 4. Analytics | Add request summaries, latency statistics, token summaries, and defensible cost estimates | Developers can understand usage and performance |
| 5. Prompt evaluation | Store prompt versions and datasets; compare versions on the same inputs | Repeatable prompt-comparison workflow |
| 6. Advanced observability | Add selected enhancements such as OpenTelemetry, background jobs, and alerts | Improved diagnostics, only where useful and testable |
| 7. Release and portfolio | Add CI checks, deployment, demo data, documentation, and a walkthrough | A reproducible, demonstrable release |

### What we are intentionally postponing

To keep the first release manageable, the MVP will not start with multiple providers, Redis/BullMQ, distributed tracing, automated alerts, complex incident management, or AI-generated root-cause analysis. These can be considered later if the working product demonstrates a clear need.

## Privacy and reliability principles

- Never commit API keys, credentials, or other secrets.
- Do not store raw prompts or model responses by default; make sensitive-content capture an explicit, documented choice if added later.
- Validate incoming data and sanitize errors before storing or displaying them.
- Treat missing token usage or pricing as unknown rather than silently recording zero.
- Test important success and failure paths, not just the happy path.
- Do not describe a feature as implemented until it has been verified.

## Repository layout

```text
FaultLens/
├── apps/
│   ├── web/       # Next.js frontend
│   ├── api/       # NestJS backend
│   └── worker/    # TypeScript worker starter
├── docs/
│   └── roadmap/   # Project plan and baseline notes
└── ...
```

This is a high-level map; individual files and scripts may evolve as the project is implemented.

## Getting started

**Local setup is being verified as part of Phase 0.** The repository uses pnpm in its existing monorepo setup. Before relying on any command, check the root `package.json` and the app-specific scripts, because the development scripts may need alignment.

1. Install a supported Node.js version and pnpm.
2. Clone the repository and enter its directory.
3. Install dependencies with `pnpm install`.
4. Inspect the root and app-level `package.json` scripts.
5. Run the existing tests and start the frontend/API using the verified scripts.
6. Record any missing environment variables or startup errors before adding new features.

Repository: [FaultLens on GitHub](https://github.com/Kushagrarai09/FaultLens)

As implementation progresses, this section will be replaced with tested, exact commands, environment-variable documentation, and any database setup steps required for the current phase.

## Phase 1 API (in progress)

The first backend milestone adds a synthetic AI-run ingestion API backed by PostgreSQL.

- `POST /api/runs` — validate and save synthetic run metadata.
- `GET /api/runs?limit=20&offset=0` — list runs, newest first, with pagination.
- `GET /api/runs/:id` — retrieve one run by UUID.
- `GET /` — existing greeting endpoint.

The API stores metadata only; raw prompts and model responses are not accepted. To configure the database, create a PostgreSQL database, set `DATABASE_URL`, and apply [the Phase 1 migration](https://github.com/Kushagrarai09/FaultLens/blob/feat/phase-1-ai-run-ingestion/apps/api/migrations/001_create_ai_runs.sql). Full setup and example requests are documented in [the Phase 1 guide](https://github.com/Kushagrarai09/FaultLens/blob/feat/phase-1-ai-run-ingestion/docs/roadmap/PHASE-1.md).

This feature is under implementation and must pass local build, database, and API tests before it is considered complete.

## Phase 2 dashboard (in progress)\n\nThe dashboard in the Phase 2 feature branch includes recent-run metrics, a reliability snapshot, searchable and filterable run history, refresh/error/empty states, and a synthetic demo-run button. The Next.js route handler proxies requests to the NestJS API. Run the API on port 3001 and the web app on port 3000; see [the Phase 2 guide](https://github.com/Kushagrarai09/FaultLens/blob/feat/phase-2-observability-dashboard/docs/roadmap/PHASE-2.md). Metrics describe only the latest 50 records. No prompt/response content or estimated costs are shown. This phase still needs local build and browser verification.\n\n## Phase 3 local model integration (in progress)\n\nPhase 3 adds an Ollama-backed generation endpoint and a local-model playground. Real generations return their response to the browser while persisting only run metadata (provider, model, status, duration, available token counts, and sanitized error code). Prompts and responses are not written to the FaultLens database. See [the Phase 3 guide](https://github.com/Kushagrarai09/FaultLens/blob/feat/phase-3-ollama-integration/docs/roadmap/PHASE-3.md). This branch requires Ollama, PostgreSQL, and local build/test/browser verification before merge.\n\n## Contributing and tracking progress

Development is organized through repository issues and the implementation roadmap:

- [Implementation roadmap](https://github.com/Kushagrarai09/FaultLens/blob/main/docs/roadmap/AI-OBSERVABILITY-ROADMAP.md)
- [Phase 0: Audit the existing setup](https://github.com/Kushagrarai09/FaultLens/issues/2)
- [Feature priorities based on the code audit](https://github.com/Kushagrarai09/FaultLens/issues/3)
- [Phase 1: Synthetic AI-run ingestion API](https://github.com/Kushagrarai09/FaultLens/issues/4)

When contributing, keep changes focused, add tests for behavior that changes, update documentation, and avoid introducing infrastructure before a concrete requirement exists.

## Definition of MVP completion

The MVP will be considered ready for its first release when a developer can:

1. Start FaultLens using documented local instructions.
2. Record successful and failed AI runs and retain them in PostgreSQL across restarts.
3. Browse, filter, and inspect runs in the dashboard.
4. Observe real calls through at least one AI provider.
5. Review available latency and token-usage metrics, with transparent cost estimates where possible.
6. Save prompt versions and compare them using the same evaluation dataset.
7. Run the critical tests and access an accurate deployed demo or recorded walkthrough.

OpenTelemetry, sophisticated alerting, and background job infrastructure are enhancements—not prerequisites for the first usable release.

---

**Current focus:** Verify Phases 1–3 locally, including PostgreSQL persistence and real local Ollama generation, before merging. Cost analytics and prompt evaluations remain future phases.
