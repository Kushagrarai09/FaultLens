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
const requiredTables = [
  'users',
  'workspaces',
  'workspace_members',
  'ai_runs',
  'prompt_templates',
  'prompt_versions',
  'evaluation_datasets',
  'evaluation_cases',
  'evaluation_runs',
  'evaluation_results',
  'alert_rules',
];
const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it before running db:migrate.');

const pool = new Pool({ connectionString: databaseUrl, max: 2 });

async function validateSchema(client) {
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const existing = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !existing.has(table));
  if (missing.length) {
    throw new Error(`Schema validation failed; missing tables: ${missing.join(', ')}.`);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    await client.query(`
      CREATE TABLE IF NOT EXISTS faultlens_schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query('SELECT pg_advisory_lock(78123456)');

    for (const filename of migrationFiles) {
      const sql = await readFile(path.join(migrationDir, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query(
        'SELECT checksum FROM faultlens_schema_migrations WHERE filename = $1',
        [filename],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration checksum mismatch: ${filename}. Restore the original file or create a new migration.`);
        }
        console.log(`Migration already applied: ${filename}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO faultlens_schema_migrations(filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );
        await client.query('COMMIT');
        console.log(`Applied migration: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    await validateSchema(client);
    console.log(`Database schema validated: ${requiredTables.length} required tables.`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(78123456)').catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
});
