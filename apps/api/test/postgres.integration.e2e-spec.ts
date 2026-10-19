import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { closeIntegrationDatabase, migrations, pool, resetData, validateSchema } from './helpers/postgres.js';

const registerBody = (workspaceName: string) => ({
  email: `faultlens-${randomUUID()}@example.test`,
  password: 'integration-test-password-2026',
  workspaceName,
});

describe('FaultLens PostgreSQL and workspace authorization integration', () => {
  let app: INestApplication;
  let originalDatabaseUrl: string | undefined;
  let originalAuthSecret: string | undefined;
  let ownerToken = '';
  let ownerWorkspaceId = '';
  let ownerEmail = '';

  const apiGet = (path: string, token = ownerToken) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  const apiPost = (path: string, token = ownerToken) =>
    request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${token}`);
  const apiPatch = (path: string, token = ownerToken) =>
    request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${token}`);

  const createRun = (overrides: Record<string, unknown> = {}, token = ownerToken) => apiPost('/api/runs', token)
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

  async function registerUser(workspaceName: string) {
    const body = registerBody(workspaceName);
    const response = await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(201);
    return { ...response.body, password: body.password, email: body.email };
  }

  beforeAll(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalAuthSecret = process.env.AUTH_TOKEN_SECRET;
    process.env.AUTH_TOKEN_SECRET ??= 'integration-only-secret-do-not-use-outside-tests-32chars';
    await pool.query('SELECT 1');
    await migrations();
    await validateSchema();

    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const owner = await registerUser('Integration Owner Workspace');
    ownerToken = owner.accessToken;
    ownerWorkspaceId = owner.workspace.id;
    ownerEmail = owner.user.email;
  }, 30_000);

  beforeEach(async () => resetData());

  afterAll(async () => {
    await app?.close();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAuthSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = originalAuthSecret;
    await closeIntegrationDatabase();
  });

  it('requires authentication for protected endpoints and validates workspace roles', async () => {
    await request(app.getHttpServer()).get('/api/runs').expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await apiGet('/api/auth/me', 'not-a-valid-token').expect(401);

    const created = await createRun().expect(201);
    const viewer = await registerUser('Viewers Own Workspace');
    await apiPost('/api/workspaces/members').send({ email: viewer.email, role: 'viewer' }).expect(201);

    const switched = await request(app.getHttpServer()).post('/api/auth/switch-workspace')
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ workspaceId: ownerWorkspaceId }).expect(201);
    const viewerToken = switched.body.accessToken;
    expect(switched.body.workspace.role).toBe('viewer');

    await apiGet(`/api/runs/${created.body.id}`, viewerToken).expect(200);
    await createRun({ model: 'viewer-should-not-write' }, viewerToken).expect(403);

    const members = await apiGet('/api/workspaces/members').expect(200);
    expect(members.body.data.some((member: { email: string; role: string }) =>
      member.email === viewer.email && member.role === 'viewer')).toBe(true);

    const createdWorkspace = await apiPost('/api/workspaces').send({ name: 'Another Workspace' }).expect(201);
    expect(createdWorkspace.body.workspace.role).toBe('owner');
    const workspaceRuns = await apiGet('/api/runs', createdWorkspace.body.accessToken).expect(200);
    expect(workspaceRuns.body.data).toHaveLength(0);
  });

  it('creates an AI run in PostgreSQL and retrieves it by ID and through workspace history', async () => {
    const created = await createRun().expect(201);
    expect(created.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const retrieved = await apiGet(`/api/runs/${created.body.id}`).expect(200);
    expect(retrieved.body).toMatchObject({
      id: created.body.id, provider: 'integration-test', model: 'synthetic-model',
      inputTokens: 10, outputTokens: 8,
    });

    const history = await apiGet('/api/runs?limit=10&offset=0').expect(200);
    expect(history.body.data.map((item: { id: string }) => item.id)).toContain(created.body.id);

    const stored = await pool.query(
      'SELECT workspace_id, provider, input_tokens, output_tokens FROM ai_runs WHERE id = $1',
      [created.body.id],
    );
    expect(stored.rows[0]).toEqual({
      workspace_id: ownerWorkspaceId,
      provider: 'integration-test',
      input_tokens: 10,
      output_tokens: 8,
    });
  });

  it('calculates analytics only from persisted records in the current workspace', async () => {
    await createRun({ status: 'success', durationMs: 100, inputTokens: 12, outputTokens: 4 }).expect(201);
    await createRun({ status: 'failure', durationMs: 300, inputTokens: 6, outputTokens: 3, errorCode: 'TEST_ERROR' }).expect(201);

    const response = await apiGet('/api/analytics/summary').expect(200);
    expect(response.body.scope).toBe('current_workspace');
    expect(response.body.totals).toMatchObject({ totalRuns: 2, successfulRuns: 1, failedRuns: 1 });
    expect(response.body.latencyMs).toMatchObject({ average: 200, p50: 200, p95: 290 });
    expect(response.body.tokens).toMatchObject({ input: 18, output: 7, total: 25 });
    expect(response.body.cost).toMatchObject({ available: false, estimatedUsd: null });
  });

  it('persists workspace-owned prompt versions and datasets, and comparison outcomes', async () => {
    const promptA = await apiPost('/api/prompts').send({
      name: 'Integration A', model: 'integration-model', template: 'Return {{input}}',
    }).expect(201);
    const promptB = await apiPost('/api/prompts').send({
      name: 'Integration B', model: 'integration-model', template: 'Answer {{input}}',
    }).expect(201);
    const dataset = await apiPost('/api/datasets').send({
      name: 'Integration dataset', description: 'Database-backed suite',
      cases: [{ input: '2+2', expectedOutput: '4' }],
    }).expect(201);

    expect(promptA.body.versions[0].version).toBe(1);
    expect(promptB.body.versions[0].version).toBe(1);
    expect(dataset.body.caseCount).toBe(1);

    const storedPrompt = await pool.query('SELECT workspace_id FROM prompt_templates WHERE id = $1', [promptA.body.id]);
    const storedDataset = await pool.query('SELECT workspace_id FROM evaluation_datasets WHERE id = $1', [dataset.body.id]);
    expect(storedPrompt.rows[0].workspace_id).toBe(ownerWorkspaceId);
    expect(storedDataset.rows[0].workspace_id).toBe(ownerWorkspaceId);

    const oldOllama = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    try {
      const comparison = await apiPost('/api/evaluations').send({
        datasetId: dataset.body.id,
        promptVersionIds: [promptA.body.versions[0].id, promptB.body.versions[0].id],
      }).expect(201);

      expect(comparison.body.status).toBe('failed');
      expect(comparison.body.failedCases).toBe(2);
      const persisted = await pool.query(
        'SELECT workspace_id FROM evaluation_runs WHERE id = $1',
        [comparison.body.id],
      );
      expect(persisted.rows[0].workspace_id).toBe(ownerWorkspaceId);
      const saved = await pool.query(
        'SELECT COUNT(*)::int AS count FROM evaluation_results WHERE evaluation_run_id = $1',
        [comparison.body.id],
      );
      expect(saved.rows[0].count).toBe(2);

      const history = await apiGet(`/api/evaluations/${comparison.body.id}`).expect(200);
      expect(history.body.results).toHaveLength(2);
    } finally {
      if (oldOllama === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = oldOllama;
    }
  });

  it('persists and evaluates alert rules only against workspace-owned run metadata', async () => {
    await createRun({ status: 'failure', durationMs: 500 }).expect(201);
    const rule = await apiPost('/api/alerts/rules').send({
      name: 'Integration failures', metric: 'failed_runs', threshold: 1, windowMinutes: 5,
    }).expect(201);

    const response = await apiPost('/api/alerts/evaluate').expect(201);
    const match = response.body.data.find((item: { rule: { id: string } }) => item.rule.id === rule.body.id);
    expect(match).toMatchObject({ status: 'triggered', observedValue: 1, sampleCount: 1, failedRuns: 1 });

    const saved = await pool.query('SELECT workspace_id, enabled FROM alert_rules WHERE id = $1', [rule.body.id]);
    expect(saved.rows[0]).toEqual({ workspace_id: ownerWorkspaceId, enabled: true });
  });

  it('prevents cross-workspace reads, writes, analytics, comparisons and alert updates', async () => {
    const run = await createRun().expect(201);
    const promptA = await apiPost('/api/prompts').send({
      name: 'Private prompt A', model: 'integration-model', template: 'Return {{input}}',
    }).expect(201);
    const promptB = await apiPost('/api/prompts').send({
      name: 'Private prompt B', model: 'integration-model', template: 'Answer {{input}}',
    }).expect(201);
    const dataset = await apiPost('/api/datasets').send({
      name: 'Private dataset', cases: [{ input: 'input', expectedOutput: 'output' }],
    }).expect(201);
    const rule = await apiPost('/api/alerts/rules').send({
      name: 'Private alert', metric: 'failed_runs', threshold: 1, windowMinutes: 5,
    }).expect(201);

    const oldOllama = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    let evaluationId = '';
    try {
      const evalRun = await apiPost('/api/evaluations').send({
        datasetId: dataset.body.id,
        promptVersionIds: [promptA.body.versions[0].id, promptB.body.versions[0].id],
      }).expect(201);
      evaluationId = evalRun.body.id;
    } finally {
      if (oldOllama === undefined) delete process.env.OLLAMA_BASE_URL;
      else process.env.OLLAMA_BASE_URL = oldOllama;
    }

    const outsider = await registerUser('Outside Workspace');
    const outsiderToken = outsider.accessToken;

    await apiGet('/api/runs', outsiderToken).expect(200)
      .expect(({ body }) => expect(body.data).toHaveLength(0));
    await apiGet(`/api/runs/${run.body.id}`, outsiderToken).expect(404);
    await apiGet('/api/analytics/summary', outsiderToken).expect(200)
      .expect(({ body }) => expect(body.totals.totalRuns).toBe(0));
    await apiGet('/api/prompts', outsiderToken).expect(200)
      .expect(({ body }) => expect(body.data).toHaveLength(0));
    await apiGet('/api/datasets', outsiderToken).expect(200)
      .expect(({ body }) => expect(body.data).toHaveLength(0));
    await apiGet('/api/alerts/rules', outsiderToken).expect(200)
      .expect(({ body }) => expect(body.data).toHaveLength(0));
    await apiGet(`/api/evaluations/${evaluationId}`, outsiderToken).expect(404);
    await apiPost('/api/evaluations', outsiderToken).send({
      datasetId: dataset.body.id,
      promptVersionIds: [promptA.body.versions[0].id, promptB.body.versions[0].id],
    }).expect(404);
    await apiPatch(`/api/alerts/rules/${rule.body.id}`, outsiderToken).send({ enabled: false }).expect(404);
  });

  it('returns a sanitized 503 when PostgreSQL is unreachable', async () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://faultlens:wrong-password@127.0.0.1:1/faultlens_test';
    let failingApp: INestApplication | undefined;
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
      failingApp = moduleFixture.createNestApplication();
      await failingApp.init();
    } finally {
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }

    try {
      const response = await request(failingApp!.getHttpServer()).get('/api/analytics/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(503);
      const payload = JSON.stringify(response.body).toLowerCase();
      expect(payload).toContain('database request failed');
      expect(payload).not.toContain('wrong-password');
      expect(payload).not.toContain('127.0.0.1');
      expect(payload).not.toContain('select');
    } finally {
      await failingApp?.close();
    }
  });

  it('supports login and refuses invalid passwords without disclosing account details', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: ownerEmail,
      password: 'integration-test-password-2026',
    }).expect(201);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.workspace.id).toBe(ownerWorkspaceId);

    await request(app.getHttpServer()).post('/api/auth/login').send({
      email: ownerEmail,
      password: 'incorrect-password-value',
    }).expect(401);

    await apiGet('/api/auth/me').expect(200)
      .expect(({ body }) => expect(body.workspace).toMatchObject({ id: ownerWorkspaceId, role: 'owner' }));
  });
});
