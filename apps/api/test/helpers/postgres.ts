import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for PostgreSQL integration tests. Use a dedicated disposable test database; never point this at production.',
  );
}

const parsedUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
if (!databaseName || !/(test|testing|integration)/i.test(databaseName)) {
  throw new Error(
    'Refusing to run integration tests: TEST_DATABASE_URL database name must include "test", "testing", or "integration".',
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const migrationFiles = [
  '001_create_ai_runs.sql',
  '002_create_prompt_evaluations.sql',
  '003_create_alert_rules.sql',
];

const migrations = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faultlens_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const filename of migrationFiles) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM faultlens_schema_migrations WHERE filename = $1',
      [filename],
    );
    if (alreadyApplied.rowCount) continue;

    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO faultlens_schema_migrations(filename) VALUES ($1)', [filename]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
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

const resetData = async () => {
  await pool.query(`
    TRUNCATE TABLE
      evaluation_results, evaluation_runs, evaluation_cases, evaluation_datasets,
      prompt_versions, prompt_templates, alert_rules, ai_runs
    RESTART IDENTITY CASCADE
  `);
};

export { pool, migrations, hasColumns, resetData };

export const closeIntegrationDatabase = async () => pool.end();
