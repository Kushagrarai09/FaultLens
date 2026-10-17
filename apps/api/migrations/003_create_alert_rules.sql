-- Phase 6: configurable reliability alert rules.
-- Alert evaluations are computed from stored AI-run metadata on demand; raw prompts
-- and model responses are not required or stored by this feature.

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  metric VARCHAR(32) NOT NULL CHECK (metric IN ('failure_rate_percent', 'p95_latency_ms', 'failed_runs')),
  threshold NUMERIC(12,2) NOT NULL CHECK (threshold > 0),
  window_minutes INTEGER NOT NULL CHECK (window_minutes BETWEEN 5 AND 1440),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules (enabled, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_created_at ON ai_runs (created_at DESC);
