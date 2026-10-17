# Phase 3 — Real model integration with Ollama

## Goal

Execute real local-model requests through FaultLens and record safe run metadata in PostgreSQL.

## Scope

- One provider integration: Ollama's non-streaming `/api/generate` endpoint.
- New `POST /api/ai/generate` API.
- Validated model and prompt input; prompts are limited to 12,000 characters.
- Request duration and token counts when Ollama supplies them.
- Success and sanitized failure records saved through the Phase 1 run service.
- Dashboard playground and a same-origin Next.js proxy route.
- Automated tests for input validation, success metadata, prompt non-persistence, and sanitized failures.

## Data flow

```text
Browser prompt form
   | POST /api/ai/generate (prompt is in transit only)
   v
Next.js route proxy
   v
NestJS API
   | POST /api/generate, stream=false
   v
Local Ollama model
   |
   | generated text + token counts
   v
NestJS stores run metadata only
   |
   v
PostgreSQL -> dashboard run list
```

## Privacy

FaultLens sends the submitted prompt to the configured Ollama service so the model can generate a response. FaultLens does **not** persist the prompt or generated response in the database. The response is returned to the browser and shown only in the current page state. Avoid entering secrets or sensitive personal data into any model prompt. Use a trusted local Ollama instance.

## Prerequisites

1. Install Ollama from its official site and start it.
2. Download a model suitable for your computer. Example command: `ollama pull qwen2.5:3b`. Model availability and performance depend on your machine.
3. Confirm the model is installed with `ollama list`.
4. Complete Phase 1 database setup and run the API/web apps.

Ollama: https://ollama.com

PowerShell API terminal:

```powershell
$env:DATABASE_URL = "postgresql://postgres:YOUR_PASSWORD@localhost:5432/faultlens"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
pnpm --filter api start:dev
```

Web terminal:

```powershell
pnpm --filter web dev
```

Open `http://localhost:3000`. Select a model name that appears in `ollama list`, enter a prompt, and click Generate.

## API example

```http
POST /api/ai/generate
Content-Type: application/json

{
  "model": "qwen2.5:3b",
  "prompt": "Explain what an API latency metric measures in two sentences."
}
```

Successful response shape:

```json
{
  "response": "Generated text returned by the local model.",
  "run": {
    "id": "database-generated-uuid",
    "provider": "ollama",
    "model": "qwen2.5:3b",
    "status": "success",
    "durationMs": 850,
    "inputTokens": 18,
    "outputTokens": 34,
    "errorCode": null,
    "startedAt": "2026-10-17T12:00:00.000Z",
    "createdAt": "2026-10-17T12:00:00.900Z"
  }
}
```

## Limitations

- Ollama must be reachable from the API process.
- The request timeout is 60 seconds; long generations may be marked as failures.
- Token fields are null if Ollama does not supply valid counts.
- No streaming, model management, multi-provider abstraction, cost estimates, prompt storage, or automatic background retries.
- If PostgreSQL is unavailable, FaultLens cannot guarantee the run is recorded.
- Dependency installation, builds, automated tests, and browser testing must pass before merging.

## Acceptance checklist

- [ ] API/web build and tests pass.
- [ ] A real Ollama generation returns text to the browser.
- [ ] Successful requests appear in run history with latency and available token counts.
- [ ] Invalid model or unavailable Ollama produces a sanitized failure record when the database is available.
- [ ] Prompts and generated responses do not appear in PostgreSQL run metadata.
- [ ] Demo synthetic runs still work.
- [ ] No API keys or credentials are required for local Ollama.
