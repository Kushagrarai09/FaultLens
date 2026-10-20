-- Phase 8: users, workspaces, membership roles, and resource ownership.
-- Existing records are moved to an intentionally unassigned legacy workspace.
-- No newly registered user is given access to legacy data automatically.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  owner_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON workspace_members (workspace_id, role);

INSERT INTO workspaces (id, name, owner_user_id)
VALUES ('00000000-0000-4000-8000-000000000001', 'Legacy data (unassigned)', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE ai_runs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE ai_runs SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE ai_runs ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_runs_workspace_created ON ai_runs (workspace_id, created_at DESC);

ALTER TABLE prompt_templates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE prompt_templates SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE prompt_templates ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prompt_templates_workspace ON prompt_templates (workspace_id, created_at DESC);

ALTER TABLE evaluation_datasets ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE evaluation_datasets SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE evaluation_datasets ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evaluation_datasets_workspace ON evaluation_datasets (workspace_id, created_at DESC);

ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE evaluation_runs er
SET workspace_id = COALESCE(
  (SELECT d.workspace_id FROM evaluation_datasets d WHERE d.id = er.dataset_id),
  '00000000-0000-4000-8000-000000000001'::uuid
)
WHERE workspace_id IS NULL;
ALTER TABLE evaluation_runs ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_workspace ON evaluation_runs (workspace_id, created_at DESC);

ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE alert_rules SET workspace_id = '00000000-0000-4000-8000-000000000001' WHERE workspace_id IS NULL;
ALTER TABLE alert_rules ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_rules_workspace ON alert_rules (workspace_id, created_at DESC);
