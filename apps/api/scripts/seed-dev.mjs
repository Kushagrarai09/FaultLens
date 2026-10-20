import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required. Set it before running db:seed:dev.');
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEVELOPMENT_SEED !== 'true') {
  throw new Error('Development seeding is disabled. Set NODE_ENV=development and ALLOW_DEVELOPMENT_SEED=true.');
}

const email = (process.env.DEV_SEED_EMAIL ?? 'local@faultlens.test').trim().toLowerCase();
const password = process.env.DEV_SEED_PASSWORD ?? 'faultlens-local-password';
const workspaceName = process.env.DEV_SEED_WORKSPACE ?? 'Local FaultLens Workspace';
const passwordHash = await new Promise((resolve, reject) => {
  const salt = randomBytes(16);
  scryptCallback(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
    if (error) reject(error);
    else resolve(`scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`);
  });
});

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const userResult = await client.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, email`,
    [email, passwordHash],
  );
  const user = userResult.rows[0];
  const workspaceResult = await client.query(
    `INSERT INTO workspaces (name, owner_user_id)
     SELECT $1, $2
     WHERE NOT EXISTS (
       SELECT 1 FROM workspaces WHERE owner_user_id = $2 AND name = $1
     )
     RETURNING id, name`,
    [workspaceName, user.id],
  );
  const workspace = workspaceResult.rows[0] ?? (await client.query(
    'SELECT id, name FROM workspaces WHERE owner_user_id = $1 AND name = $2',
    [user.id, workspaceName],
  )).rows[0];
  await client.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
    [workspace.id, user.id],
  );

  await client.query(
    `INSERT INTO ai_runs
      (workspace_id, provider, model, status, duration_ms, input_tokens, output_tokens, started_at)
     SELECT $1, 'faultlens-demo', 'qwen2.5:3b', value.status, value.duration_ms,
            value.input_tokens, value.output_tokens, NOW() - make_interval(mins => value.minutes)
     FROM (VALUES
       ('success', 420, 72, 118, 12),
       ('success', 860, 94, 207, 8),
       ('failure', 5000, 64, NULL, 3)
     ) AS value(status, duration_ms, input_tokens, output_tokens, minutes)
     WHERE NOT EXISTS (
       SELECT 1 FROM ai_runs WHERE workspace_id = $1 AND provider = 'faultlens-demo'
     )`,
    [workspace.id],
  );

  const prompt = await client.query(
    `INSERT INTO prompt_templates (workspace_id, name, model)
     VALUES ($1, 'Local support assistant', 'qwen2.5:3b')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [workspace.id],
  );
  let promptId = prompt.rows[0]?.id;
  if (!promptId) {
    promptId = (await client.query(
      `SELECT id FROM prompt_templates WHERE workspace_id = $1 AND name = 'Local support assistant'`,
      [workspace.id],
    )).rows[0].id;
  }
  await client.query(
    `INSERT INTO prompt_versions (prompt_id, version, template)
     VALUES ($1, 1, 'Answer clearly and briefly: {{input}}')
     ON CONFLICT (prompt_id, version) DO NOTHING`,
    [promptId],
  );

  const dataset = await client.query(
    `INSERT INTO evaluation_datasets (workspace_id, name, description)
     VALUES ($1, 'Local smoke dataset', 'Synthetic examples for local development.')
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [workspace.id],
  );
  let datasetId = dataset.rows[0]?.id;
  if (!datasetId) {
    datasetId = (await client.query(
      `SELECT id FROM evaluation_datasets WHERE workspace_id = $1 AND name = 'Local smoke dataset'`,
      [workspace.id],
    )).rows[0].id;
  }
  await client.query(
    `INSERT INTO evaluation_cases (dataset_id, input, expected_output)
     SELECT $1, value.input, value.expected_output
     FROM (VALUES ('What is 2 + 2?', '4'), ('Say hello.', 'Hello.')) AS value(input, expected_output)
     WHERE NOT EXISTS (SELECT 1 FROM evaluation_cases WHERE dataset_id = $1)`,
    [datasetId],
  );

  await client.query('COMMIT');
  console.log(JSON.stringify({
    email,
    password,
    workspace: workspace.name,
    workspaceId: workspace.id,
    seeded: true,
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
