-- Optional synthetic demo data. Apply after migrations 001–004.
-- Requires the UUID of a workspace you control (never seed into legacy/unassigned data).
-- Example:
--   psql "$DATABASE_URL" -v workspace_id="<workspace UUID>" -f apps/api/seeds/demo_runs.sql
-- Synthetic metadata only: no real prompts, responses, user data, or credentials.
-- Idempotent per workspace: rerunning this seed does not duplicate its marker rows.

INSERT INTO ai_runs
  (workspace_id, provider, model, status, duration_ms, input_tokens, output_tokens, error_code, started_at, created_at)
SELECT
  :'workspace_id'::uuid,
  seed.provider,
  seed.model,
  seed.status,
  seed.duration_ms,
  seed.input_tokens,
  seed.output_tokens,
  seed.error_code,
  NOW() - (seed.age_minutes * INTERVAL '1 minute'),
  NOW() - (seed.age_minutes * INTERVAL '1 minute')
FROM (
  VALUES
    ('faultlens-demo', 'qwen2.5:3b', 'success', 420, 28, 94, NULL::varchar, 4),
    ('faultlens-demo', 'qwen2.5:3b', 'success', 680, 31, 112, NULL::varchar, 8),
    ('faultlens-demo', 'qwen2.5:3b', 'failure', 1200, 22, NULL::integer, 'OLLAMA_UNAVAILABLE'::varchar, 12),
    ('faultlens-demo', 'qwen2.5:3b', 'success', 530, 25, 87, NULL::varchar, 17),
    ('faultlens-demo', 'qwen2.5:3b', 'failure', 2500, 35, NULL::integer, 'OLLAMA_TIMEOUT'::varchar, 23),
    ('faultlens-demo', 'qwen2.5:3b', 'success', 390, 19, 73, NULL::varchar, 29),
    ('faultlens-demo', 'qwen2.5:3b', 'success', 810, 42, 126, NULL::varchar, 36),
    ('faultlens-demo', 'qwen2.5:3b', 'success', 610, 33, 101, NULL::varchar, 44)
) AS seed(provider, model, status, duration_ms, input_tokens, output_tokens, error_code, age_minutes)
WHERE NOT EXISTS (
  SELECT 1 FROM ai_runs
  WHERE provider = 'faultlens-demo' AND workspace_id = :'workspace_id'::uuid
);
