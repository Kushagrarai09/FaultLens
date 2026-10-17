-- Phase 5: versioned prompts, reusable evaluation datasets, and comparison results.
-- Prompt templates and evaluation examples are intentionally stored because the
-- developer explicitly creates them for repeatable evaluation. Runtime generation
-- outputs are not persisted; only scores, latency, token counts, and status are stored.

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  model VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  template TEXT NOT NULL CHECK (length(template) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_id, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions (prompt_id, version DESC);

CREATE TABLE IF NOT EXISTS evaluation_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  input TEXT NOT NULL CHECK (length(input) BETWEEN 1 AND 12000),
  expected_output TEXT NOT NULL CHECK (length(expected_output) BETWEEN 1 AND 12000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_cases_dataset ON evaluation_cases (dataset_id, created_at);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES evaluation_datasets(id) ON DELETE RESTRICT,
  status VARCHAR(12) NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
  case_count INTEGER NOT NULL CHECK (case_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  prompt_version_id UUID NOT NULL REFERENCES prompt_versions(id) ON DELETE RESTRICT,
  model VARCHAR(160) NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'failure')),
  score NUMERIC(5,2) NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0 AND duration_ms <= 86400000),
  input_tokens INTEGER NULL CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER NULL CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_results_run ON evaluation_results (evaluation_run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_version ON evaluation_results (prompt_version_id, created_at DESC);
