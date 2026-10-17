# Phase 5 — Prompt versioning and evaluation

## Goal
Save immutable prompt versions and a small reusable dataset, run the same cases against 2–4 selected versions, and compare a transparent baseline score alongside failures, latency, and token usage.

## Database setup
Apply `apps/api/migrations/002_create_prompt_evaluations.sql` to the PostgreSQL database after applying the Phase 1 migration. Phase 5 stores prompt templates and explicitly authored dataset examples for reproducible testing. It does not store model-generated response text.

## API
- `GET /api/prompts` — list prompt templates and versions.
- `POST /api/prompts` — create a prompt with version 1. Body: `{ "name": "Support answer", "model": "qwen2.5:3b", "template": "Answer clearly: {{input}}" }`.
- `POST /api/prompts/:id/versions` — add an immutable version. Body: `{ "template": "Answer in three bullet points: {{input}}" }`.
- `GET /api/datasets` — list datasets and cases.
- `POST /api/datasets` — create a dataset with 1–50 cases. Body: `{ "name": "Basics", "description": "Small smoke test", "cases": [{ "input": "What is an API?", "expectedOutput": "An API lets software systems communicate." }] }`.
- `POST /api/evaluations` — compare 2–4 prompt version IDs against a dataset. Body: `{ "datasetId": "<dataset UUID>", "promptVersionIds": ["<version UUID A>", "<version UUID B>"] }`.
- `GET /api/evaluations/:id` — retrieve persisted evaluation metadata and scores.

Prompt templates should include `{{input}}`; FaultLens substitutes the dataset input at evaluation time. Each version uses its configured Ollama model. Cases run sequentially to keep load predictable. A maximum of 50 cases per dataset and 4 versions per comparison is enforced.

## Score method and limitations
The initial score is a simple deterministic heuristic: case-insensitive word-token overlap between the response and expected output, divided by the number of unique expected-output tokens. It is a rough regression signal, not semantic correctness, factuality, or an LLM-as-a-judge score. Review the outputs yourself before choosing a prompt. No generated response text is stored.

## Results
Each comparison reports average score, successful/failed cases, average latency, and known token totals per prompt version, plus per-case status and duration. Pricing is not estimated because verified provider/model pricing is not configured.

## Local verification
1. Install dependencies and apply the Phase 1 and Phase 5 SQL migrations.
2. Start PostgreSQL, Ollama, the API, and web app using the Phase 3 setup guide.
3. Open `http://localhost:3000/evaluations`.
4. Create one prompt; add a second version; create a small dataset with expected outputs.
5. Select at least two versions and run the same dataset.
6. Verify summaries, failed cases, token coverage, and latency.
7. Run `pnpm --filter api test`, `pnpm --filter api build`, and `pnpm --filter web build`.

## Privacy and operational notes
- Prompt templates and evaluation inputs/expected outputs are stored intentionally as authored test assets.
- Generated responses are returned to the evaluator only for scoring and are not persisted.
- Do not place secrets or personal/sensitive data in evaluation cases.
- Evaluation is synchronous and can take time: each case/model call can take up to 60 seconds. Start with 2–5 cases and two prompt versions.
- The code has not yet been locally built or tested; keep the PR draft until the checklist passes.
