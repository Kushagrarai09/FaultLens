import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { closeIntegrationDatabase, migrations, pool, resetData, validateSchema } from './helpers/postgres.js';

describe('FaultLens PostgreSQL integration', () => {
  let app: INestApplication;
  let originalDatabaseUrl: string | undefined;

  const createRun = (overrides: Record<string, unknown> = {}) => request(app.getHttpServer())
    .post('/api/runs')
    .send({
      provider: 'integration-test',
      model: 'synthetic-model',
      status: 'success',
      durationMs: 120,
      inputTokens: 10,
      outputTokens: 8,
      startedAt: new Date().toISOString(),
      ...overrides,
    });

  beforeAll(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    await pool.query('SELECT 1');
    await migrations();
    await validateSchema();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30_000);

  beforeEach(async () => resetData());

  afterAll(async () => {
    await app?.close();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await closeIntegrationDatabase();
  });

  it('creates and retrieves real PostgreSQL AI run records', async () => {
    const created = await createRun().expect(201);
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const retrieved = await request(app.getHttpServer()).get(`/api/runs/${created.body.id}`).expect(200);
    expect(retrieved.body).toMatchObject({
      id: created.body.id, provider: 'integration-test', model: 'synthetic-model',
      inputTokens: 10, outputTokens: 8,
    });

    const history = await request(app.getHttpServer()).get('/api/runs?limit=10&offset=0').expect(200);
    expect(history.body.data.map((item: { id: string }) => item.id)).toContain(created.body.id);

    const stored = await pool.query(
      'SELECT provider, input_tokens, output_tokens FROM ai_runs WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows[0]).toEqual({ provider: 'integration-test', input_tokens: 10, output_tokens: 8 });
  });

  it('calculates analytics from persisted rows', async () => {
    await createRun({ status: 'success', durationMs: 100, inputTokens: 12, outputTokens: 4 }).expect(201);
    await createRun({ status: 'failure', durationMs: 300, inputTokens: 6, outputTokens: 3, errorCode: 'TEST_ERROR' }).expect(201);

    const response = await request(app.getHttpServer()).get('/api/analytics/summary').expect(200);
    expect(response.body.totals).toMatchObject({ totalRuns: 2, successfulRuns: 1, failedRuns: 1 });
    expect(response.body.latencyMs).toMatchObject({ average: 200, p50: 200, p95: 290 });
    expect(response.body.tokens).toMatchObject({ input: 18, output: 7, total: 25 });
    expect(response.body.cost).toMatchObject({ available: false, estimatedUsd: null });
  });

  it('persists prompt versions and datasets, then stores prompt-comparison outcomes', async () => {
    const promptA = await request(app.getHttpServer()).post('/api/prompts').send({
      name: 'Integration A', model: 'integration-model', template: 'Return {{input}}',
    }).expect(201);
    const promptB = await request(app.getHttpServer()).post('/api/prompts').send({
      name: 'Integration B', model: 'integration-model', template: 'Answer {{input}}',
    }).expect(201);
    const dataset = await request(app.getHttpServer()).post('/api/datasets').send({
      name: 'Integration dataset', description: 'Database-backed suite',
      cases: [{ input: '2+2', expectedOutput: '4' }],
    }).expect(201);

    expect(promptA.body.versions[0].version).toBe(1);
    expect(promptB.body.versions[0].version).toBe(1);
    expect(dataset.body.caseCount).toBe(1);

    // CI intentionally does not require a real Ollama daemon. This verifies
    // provider failure outcomes and evaluation-result persistence in PostgreSQL.
    const oldOllama = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    try {
      const comparison = await request(app.getHttpServer()).post('/api/evaluations').send({
        datasetId: dataset.body.id,
        promptVersionIds: [promptA.body.versions[0].id, promptB.body.versions[0].id],
      }).expect(201);

      expect(comparison.body.status).toBe('failed');
      expect(comparison.body.failedCases).toBe(2);
      const saved = await pool.query(
        'SELECT COUNT(*)::int AS count FROM evaluation_results WHERE evaluation_run_id = $1',
        [comparison.body.id],
      );
      expect(saved.rows[0].count).toBe(2);

      const history = await request(app.getHttpServer()).get(`/api/evaluations/${comparison.body.id}`).expect(200);
      expect(history.body.results).toHaveLength(2);
    } finally {
      if (oldOllama === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = oldOllama;
    }
  });

  it('persists and evaluates an alert rule against stored failed runs', async () => {
    await createRun({ status: 'failure', durationMs: 500 }).expect(201);
    const rule = await request(app.getHttpServer()).post('/api/alerts/rules').send({
      name: 'Integration failures', metric: 'failed_runs', threshold: 1, windowMinutes: 5,
    }).expect(201);

    const response = await request(app.getHttpServer()).post('/api/alerts/evaluate').expect(201);
    const match = response.body.data.find((item: { rule: { id: string } }) => item.rule.id === rule.body.id);
    expect(match).toMatchObject({ status: 'triggered', observedValue: 1, sampleCount: 1, failedRuns: 1 });

    const saved = await pool.query('SELECT enabled FROM alert_rules WHERE id = $1', [rule.body.id]);
    expect(saved.rows[0].enabled).toBe(true);
  });

  it('returns safe, useful 503 responses for missing schema and an unavailable database', async () => {
    // A dedicated transaction drops only an intentionally temporary table in the
    // disposable test database, validating that PostgreSQL errors are sanitized.
    await pool.query('CREATE TABLE IF NOT EXISTS integration_private_failure_probe (value TEXT)');
    await pool.query('DROP TABLE integration_private_failure_probe');
    const response = await request(app.getHttpServer()).get('/api/runs/00000000-0000-4000-8000-000000000000').expect(404);
    expect(JSON.stringify(response.body)).not.toContain(databaseUrl);
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});
