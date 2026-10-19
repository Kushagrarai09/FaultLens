import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { closeIntegrationDatabase, hasColumns, migrations, pool, resetData } from './helpers/postgres.js';

describe('FaultLens PostgreSQL integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await pool.query('SELECT 1');
    await migrations();
    await Promise.all([
      hasColumns('ai_runs', ['id', 'provider', 'model', 'status', 'duration_ms', 'input_tokens', 'output_tokens', 'started_at', 'created_at']),
      hasColumns('prompt_templates', ['id', 'name', 'model']),
      hasColumns('prompt_versions', ['id', 'prompt_id', 'version', 'template']),
      hasColumns('evaluation_datasets', ['id', 'name', 'description']),
      hasColumns('evaluation_cases', ['id', 'dataset_id', 'input', 'expected_output']),
      hasColumns('evaluation_runs', ['id', 'dataset_id', 'status', 'case_count']),
      hasColumns('evaluation_results', ['id', 'evaluation_run_id', 'prompt_version_id', 'status', 'score', 'duration_ms']),
      hasColumns('alert_rules', ['id', 'name', 'metric', 'threshold', 'window_minutes', 'enabled']),
    ]);
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30_000);

  beforeEach(async () => {
    await resetData();
  });

  afterAll(async () => {
    await app?.close();
    await closeIntegrationDatabase();
  });

  const createRun = async (overrides: Record<string, unknown> = {}) => request(app.getHttpServer())
    .post('/api/runs')
    .send({
      provider: 'synthetic-integration',
      model: 'test-model',
      status: 'success',
      durationMs: 120,
      inputTokens: 10,
      outputTokens: 8,
      startedAt: new Date().toISOString(),
      ...overrides,
    });

  it('creates an AI run in PostgreSQL and retrieves it by ID and through history', async () => {
    const created = await createRun().expect(201);
    expect(created.body).toMatchObject({
      provider: 'synthetic-integration',
      model: 'test-model',
      status: 'success',
      durationMs: 120,
      inputTokens: 10,
      outputTokens: 8,
    });
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const retrieved = await request(app.getHttpServer()).get(`/api/runs/${created.body.id}`).expect(200);
    expect(retrieved.body.id).toBe(created.body.id);

    const history = await request(app.getHttpServer()).get('/api/runs?limit=10&offset=0').expect(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].id).toBe(created.body.id);

    const persisted = await pool.query('SELECT provider, input_tokens, output_tokens FROM ai_runs WHERE id = $1', [created.body.id]);
    expect(persisted.rows[0]).toEqual({
      provider: 'synthetic-integration',
      input_tokens: 10,
      output_tokens: 8,
    });
  });

  it('calculates analytics from the rows actually persisted in PostgreSQL', async () => {
    await createRun({ status: 'success', durationMs: 100, inputTokens: 12, outputTokens: 4 }).expect(201);
    await createRun({ status: 'failure', durationMs: 300, inputTokens: 6, outputTokens: 3, errorCode: 'TEST_ERROR' }).expect(201);
    const result = await request(app.getHttpServer()).get('/api/analytics/summary').expect(200);
    expect(result.body.totals).toMatchObject({ totalRuns: 2, successfulRuns: 1, failedRuns: 1 });
    expect(result.body.latencyMs).toMatchObject({ average: 200, p50: 200, p95: 290 });
    expect(result.body.tokens).toMatchObject({ input: 18, output: 7, total: 25 });
    expect(result.body.cost).toMatchObject({ available: false, estimatedUsd: null });
  });

  it('creates prompt versions and datasets, then records evaluation comparison results in PostgreSQL', async () => {
    const promptA = await request(app.getHttpServer()).post('/api/prompts')
      .send({ name: 'Integration prompt A', model: 'integration-model', template: 'Return {{input}}' }).expect(201);
    const promptB = await request(app.getHttpServer()).post('/api/prompts')
      .send({ name: 'Integration prompt B', model: 'integration-model', template: 'Answer: {{input}}' }).expect(201);
    expect(promptA.body.versions[0].version).toBe(1);
    expect(promptB.body.versions[0].version).toBe(1);

    const dataset = await request(app.getHttpServer()).post('/api/datasets')
      .send({
        name: 'Integration dataset',
        description: 'Database-backed tests',
        cases: [{ input: '2 + 2', expectedOutput: '4' }],
      }).expect(201);

    expect(dataset.body.caseCount).toBe(1);
    const storedDataset = await pool.query('SELECT id FROM evaluation_datasets WHERE id = $1', [dataset.body.id]);
    expect(storedDataset.rowCount).toBe(1);

    // Ollama is intentionally unavailable in CI: the integration checks that failed
    // provider calls are recorded consistently, not that a model generates text.
    const oldOllama = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    try {
      const comparison = await request(app.getHttpServer()).post('/api/evaluations')
        .send({
          datasetId: dataset.body.id,
          promptVersionIds: [promptA.body.versions[0].id, promptB.body.versions[0].id],
        }).expect(201);
      expect(comparison.body.status).toBe('failed');
      expect(comparison.body.failedCases).toBe(2);
      const persisted = await pool.query(
        'SELECT COUNT(*)::int AS count FROM evaluation_results WHERE evaluation_run_id = $1',
        [comparison.body.id],
      );
      expect(persisted.rows[0].count).toBe(2);
    } finally {
      if (oldOllama === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = oldOllama;
    }
  });

  it('creates and evaluates a database-backed alert rule using stored run metadata', async () => {
    await createRun({ status: 'failure', durationMs: 500 }).expect(201);
    const rule = await request(app.getHttpServer()).post('/api/alerts/rules')
      .send({ name: 'Integration failure threshold', metric: 'failed_runs', threshold: 1, windowMinutes: 5 })
      .expect(201);
    expect(rule.body).toMatchObject({ name: 'Integration failure threshold', metric: 'failed_runs', threshold: 1 });

    const evaluation = await request(app.getHttpServer()).post('/api/alerts/evaluate').expect(201);
    const matching = evaluation.body.data.find((item: { rule: { id: string } }) => item.rule.id === rule.body.id);
    expect(matching).toMatchObject({ status: 'triggered', observedValue: 1, sampleCount: 1, failedRuns: 1 });

    const persisted = await pool.query('SELECT enabled FROM alert_rules WHERE id = $1', [rule.body.id]);
    expect(persisted.rows[0].enabled).toBe(true);
  });

  it('returns a safe 503 for database failures without leaking database internals', async () => {
    await app.close();
    const originalUrl = process.env.DATABASE_URL;
    // The Nest DatabaseService reads DATABASE_URL during construction. Close the
    // working app first, then use a temporary invalid connection to test API errors.
    process.env.DATABASE_URL = 'postgresql://faultlens:wrong-password@127.0.0.1:1/faultlens_test';
    try {
      const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const failingApp = moduleFixture.createNestApplication();
      await failingApp.init();
      const response = await request(failingApp.getHttpServer()).get('/api/analytics/summary').expect(503);
      expect(JSON.stringify(response.body)).not.toContain('wrong-password');
      expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
      await failingApp.close();
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });
});
