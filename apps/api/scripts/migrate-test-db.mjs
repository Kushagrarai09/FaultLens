import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationFiles = [
  '001_create_ai_runs.sql',
  '002_create_prompt_evaluations.sql',
  '003_create_alert_rules.sql',
  '004_create_auth_workspaces.sql',
];
const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

function assertTestDatabase(connectionString) {
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/(test|testing|integration)/i.test(database)) {
    throw new Error(
      `Refusing to run test migrations against database "${database}". The name must include test, testing, or integration.`,
    );
  }
}

async function main() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL test database.');
  }
  assertTestDatabase(connectionString);

  const pool = new Pool({ connectionString, max: 2 });
  try {
    await pool.query('SELECT 1');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faultlens_schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of migrationFiles) {
      const sql = await readFile(path.join(migrationDir, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await pool.query(
        'SELECT checksum FROM faultlens_schema_migrations WHERE filename = $1',
        [filename],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration checksum mismatch: ${filename}`);
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

    const requiredTables = [
      'users', 'workspaces', 'workspace_members', 'ai_runs', 'prompt_templates', 'prompt_versions', 'evaluation_datasets',
      'evaluation_cases', 'evaluation_runs', 'evaluation_results', 'alert_rules',
    ];
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const existing = new Set(result.rows.map((row) => row.table_name));
    const missing = requiredTables.filter((table) => !existing.has(table));
    if (missing.length) {
      throw new Error(`Migration validation failed; missing tables: ${missing.join(', ')}`);
    }
    console.log(`PostgreSQL test schema validated: ${requiredTables.length} required tables.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Test database migration failed.');
  process.exitCode = 1;
});
