import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const migrationFiles = [
  '001_create_ai_runs.sql',
  '002_create_prompt_evaluations.sql',
  '003_create_alert_rules.sql',
] as const;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationDir = path.join(rootDir, 'migrations');

const assertTestDatabase = (connectionString: string) => {
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/(test|testing|integration)/i.test(database)) {
    throw new Error(
      `Refusing to run test migrations against database "${database}". Its name must include test, testing, or integration.`,
    );
  }
};

const applyMigrations = async (pool: Pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faultlens_schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const filename of migrationFiles) {
    const sql = await readFile(path.join(migrationDir, filename), 'utf8');
    const checksum = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(sql).digest('hex'),
    );
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

    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO faultlens_schema_migrations(filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
};

const main = async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL test database.');
  }
  assertTestDatabase(connectionString);
  const pool = new Pool({ connectionString, max: 2 });
  try {
    await pool.query('SELECT 1');
    await applyMigrations(pool);
    const requiredTables = [
      'ai_runs', 'prompt_templates', 'prompt_versions', 'evaluation_datasets',
      'evaluation_cases', 'evaluation_runs', 'evaluation_results', 'alert_rules',
    ];
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const found = new Set(result.rows.map((row: { table_name: string }) => row.table_name));
    const missing = requiredTables.filter((table) => !found.has(table));
    if (missing.length) throw new Error(`Migration validation failed; missing tables: ${missing.join(', ')}`);
    console.log(`PostgreSQL test schema is ready. Validated ${requiredTables.length} required tables.`);
  } finally {
    await pool.end();
  }
};

await main();
