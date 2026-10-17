-- Phase 1: durable storage for synthetic AI-run metadata.
-- Apply this file to the PostgreSQL database configured by DATABASE_URL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(80) NOT NULL,
  model VARCHAR(160) NOT NULL,
  status VARCHAR(10) NOT NULL CHECK (status IN ('success', 'failure')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0 AND duration_ms <= 86400000),
  input_tokens INTEGER NULL CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER NULL CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code VARCHAR(120) NULL,
  started_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status_created_at ON ai_runs (status, created_at DESC);
