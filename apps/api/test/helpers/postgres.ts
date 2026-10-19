import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL integration tests. Use a dedicated disposable test database; never point this at production.',
  );
}

const parsedUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
if (!/(test|testing|integration)/i.test(databaseName)) {
  throw new Error(
    'Refusing to run integration tests: TEST_DATABASE_URL database name must include "test", "testing", or "integration".',
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const migrationFiles = [
  '001_create_ai_runs.sql',
  '002_create_prompt_evaluations.sql',
  '003_create_alert_rules.sql',
  '004_create_auth_workspaces.sql',
];

const migrations = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faultlens_schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const filename of migrationFiles) {
    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
    const { createHash } = await import('node:crypto');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await pool.query(
      'SELECT checksum FROM faultlens_schema_migrations WHERE filename = $1',
      [filename],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Migration checksum changed after application: ${filename}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO faultlens_schema_migrations(filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

const hasColumns = async (table: string, columns: string[]) => {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const found = new Set(result.rows.map((row: { column_name: string }) => row.column_name));
  const missing = columns.filter((column) => !found.has(column));
  if (missing.length) {
    throw new Error(`Schema validation failed for ${table}; missing columns: ${missing.join(', ')}`);
  }
};

const validateSchema = async () => {
  const required: Record<string, string[]> = {
    ai_runs: ['id', 'workspace_id', 'provider', 'model', 'status', 'duration_ms', 'input_tokens', 'output_tokens', 'started_at', 'created_at'],
    users: ['id', 'email', 'password_hash'],
    workspaces: ['id', 'name', 'owner_user_id'],
    workspace_members: ['workspace_id', 'user_id', 'role'],
    prompt_templates: ['id', 'workspace_id', 'name', 'model'],
    prompt_versions: ['id', 'prompt_id', 'version', 'template'],
    evaluation_datasets: ['id', 'workspace_id', 'name', 'description'],
    evaluation_cases: ['id', 'dataset_id', 'input', 'expected_output'],
    evaluation_runs: ['id', 'workspace_id', 'dataset_id', 'status', 'case_count'],
    evaluation_results: ['id', 'evaluation_run_id', 'prompt_version_id', 'status', 'score', 'duration_ms'],
    alert_rules: ['id', 'workspace_id', 'name', 'metric', 'threshold', 'window_minutes', 'enabled'],
  };
  for (const [table, columns] of Object.entries(required)) {
    await hasColumns(table, columns);
  }
};

const resetData = async () => {
  await pool.query(`
    TRUNCATE TABLE
      evaluation_results, evaluation_runs, evaluation_cases, evaluation_datasets,
      prompt_versions, prompt_templates, alert_rules, ai_runs
    RESTART IDENTITY CASCADE
  `);
};

export { pool, migrations, validateSchema, resetData };
export const closeIntegrationDatabase = async () => pool.end();
