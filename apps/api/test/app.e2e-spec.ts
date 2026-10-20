import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { ApiRateLimitGuard } from '../src/security/api-rate-limit.guard.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const body = (workspaceName: string) => ({
  email: `e2e-${randomUUID()}@example.test`,
  password: 'e2e-password-long-enough-2026',
  workspaceName,
});

suite('FaultLens HTTP API (e2e)', () => {
  let app: INestApplication<App>;
  let token = '';
  let workspaceId = '';
  let email = '';
  const originalOllamaUrl = process.env.OLLAMA_BASE_URL;
  const originalRateLimit = process.env.API_RATE_LIMIT_MAX;
  let integration: typeof import('./helpers/postgres.js');

  const get = (path: string, accessToken = token) => {
    const call = request(app.getHttpServer()).get(path);
    return accessToken ? call.set('Authorization', `Bearer ${accessToken}`) : call;
  };
  const post = (path: string, accessToken = token) => {
    const call = request(app.getHttpServer()).post(path);
    return accessToken ? call.set('Authorization', `Bearer ${accessToken}`) : call;
  };

  beforeAll(async () => {
    if (!hasDatabase) return;
    integration = await import('./helpers/postgres.js');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.AUTH_TOKEN_SECRET ??= 'e2e-only-secret-do-not-use-outside-tests-32chars';
    process.env.API_RATE_LIMIT_MAX = '1000';
    process.env.API_BODY_LIMIT_BYTES = '1024';
    await integration.pool.query('SELECT 1');
    await integration.migrations();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    const express = app.getHttpAdapter().getInstance();
    const expressModule = await import('express');
    express.use(expressModule.json({ limit: 1024, strict: true }));
    express.use(expressModule.urlencoded({ extended: false, limit: 1024 }));
    app.enableCors({
      origin: ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    });
    app.useGlobalGuards(app.get(ApiRateLimitGuard));
    await app.init();

    const registration = await request(app.getHttpServer()).post('/api/auth/register')
      .send(body('E2E owner workspace')).expect(201);
    token = registration.body.accessToken;
    workspaceId = registration.body.workspace.id;
    email = registration.body.user.email;
  }, 30_000);

  beforeEach(async () => {
    if (hasDatabase) await integration.resetData();
    app?.get(ApiRateLimitGuard).clearForTests();
    process.env.API_RATE_LIMIT_MAX = '1000';
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    await app?.close();
    if (originalOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalOllamaUrl;
    if (originalRateLimit === undefined) delete process.env.API_RATE_LIMIT_MAX;
    else process.env.API_RATE_LIMIT_MAX = originalRateLimit;
    await integration.closeIntegrationDatabase();
  });

  it('requires authentication for protected endpoints', async () => {
    await get('/api/runs', '').expect(401);
    await get('/api/auth/me', 'not-a-token').expect(401);
  });

  it('registers, logs in, and returns the current workspace', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: 'e2e-password-long-enough-2026' }).expect(201);
    expect(login.body).toMatchObject({
      user: { email },
      workspace: { id: workspaceId, role: 'owner' },
    });
    await get('/api/auth/me').expect(200)
      .expect(({ body: response }) => expect(response.workspace.id).toBe(workspaceId));
    await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: 'wrong-password-value' }).expect(401);
  });

  it('creates, retrieves, paginates, and isolates AI runs', async () => {
    const first = await post('/api/runs').send({
      provider: 'e2e', model: 'synthetic', status: 'success', durationMs: 100,
      inputTokens: 10, outputTokens: 20, startedAt: new Date().toISOString(),
    }).expect(201);
    const second = await post('/api/runs').send({
      provider: 'e2e', model: 'synthetic', status: 'failure', durationMs: 300,
      errorCode: 'E2E_FAILURE', startedAt: new Date().toISOString(),
    }).expect(201);
    await get(`/api/runs/${first.body.id}`).expect(200)
      .expect(({ body: response }) => expect(response.provider).toBe('e2e'));
    await get('/api/runs?limit=1&offset=1').expect(200)
      .expect(({ body: response }) => {
        expect(response.data).toHaveLength(1);
        expect(response.data[0].id).toBe(first.body.id);
      });

    const outsider = await request(app.getHttpServer()).post('/api/auth/register')
      .send(body('E2E outsider workspace')).expect(201);
    await get(`/api/runs/${second.body.id}`, outsider.body.accessToken).expect(404);
    await get('/api/runs', outsider.body.accessToken).expect(200)
      .expect(({ body: response }) => expect(response.data).toHaveLength(0));
  });

  it('calculates analytics from the current workspace', async () => {
    await post('/api/runs').send({
      provider: 'analytics', model: 'model', status: 'success', durationMs: 100,
      inputTokens: 4, outputTokens: 6, startedAt: new Date().toISOString(),
    }).expect(201);
    await post('/api/runs').send({
      provider: 'analytics', model: 'model', status: 'failure', durationMs: 300,
      inputTokens: 2, outputTokens: 3, startedAt: new Date().toISOString(),
    }).expect(201);
    await get('/api/analytics/summary').expect(200)
      .expect(({ body: response }) => {
        expect(response.totals).toMatchObject({ totalRuns: 2, successfulRuns: 1, failedRuns: 1 });
        expect(response.tokens).toMatchObject({ input: 6, output: 9, total: 15 });
      });
  });

  it('handles Ollama success and provider failure', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      model: 'synthetic', response: 'E2E response', done: true,
      prompt_eval_count: 7, eval_count: 9,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    try {
      const success = await post('/api/ai/generate').send({ model: 'synthetic', prompt: 'hello' }).expect(201);
      expect(success.body.response).toBe('E2E response');
      expect(success.body.run.status).toBe('success');
    } finally {
      globalThis.fetch = originalFetch;
    }

    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    const failed = await post('/api/ai/generate').send({ model: 'synthetic', prompt: 'timeout' }).expect(201);
    expect(failed.body.run.status).toBe('failure');
    expect(failed.body.response).toBeUndefined();
  });

  it('creates prompt versions, datasets, comparisons, and alerts', async () => {
    const prompt = await post('/api/prompts').send({
      name: 'E2E prompt', model: 'synthetic', template: 'Answer {{input}}',
    }).expect(201);
    const version = await post(`/api/prompts/${prompt.body.id}/versions`).send({
      template: 'Answer carefully: {{input}}',
    }).expect(201);
    expect(version.body.version).toBe(2);

    const dataset = await post('/api/datasets').send({
      name: 'E2E dataset', description: 'Synthetic cases',
      cases: [{ input: '2+2', expectedOutput: '4' }],
    }).expect(201);
    expect(dataset.body.caseCount).toBe(1);

    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
    const comparison = await post('/api/evaluations').send({
      datasetId: dataset.body.id,
      promptVersionIds: [prompt.body.versions[0].id, version.body.id],
    }).expect(201);
    expect(comparison.body.status).toBe('failed');
    await get(`/api/evaluations/${comparison.body.id}`).expect(200);

    await post('/api/runs').send({
      provider: 'alerts', model: 'synthetic', status: 'failure', durationMs: 100,
      startedAt: new Date().toISOString(),
    }).expect(201);
    const rule = await post('/api/alerts/rules').send({
      name: 'E2E failures', metric: 'failed_runs', threshold: 1, windowMinutes: 5,
    }).expect(201);
    expect(rule.body.enabled).toBe(true);
    await post('/api/alerts/evaluate').expect(201)
      .expect(({ body: response }) => expect(response.data[0].status).toBe('triggered'));
  });

  it('returns sanitized validation and database failures', async () => {
    await post('/api/runs').send({ status: 'invalid' }).expect(400);
    await get('/api/runs?limit=not-a-number').expect(400);

    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://wrong:wrong@127.0.0.1:1/faultlens_test';
    const failingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const failingApp = failingModule.createNestApplication();
    await failingApp.init();
    try {
      const response = await request(failingApp.getHttpServer())
        .get('/api/analytics/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(503);
      expect(JSON.stringify(response.body)).not.toContain('127.0.0.1');
      expect(JSON.stringify(response.body)).toContain('database');
    } finally {
      await failingApp.close();
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it('enforces CORS, request-size limits, and rate limits', async () => {
    await request(app.getHttpServer()).options('/api/runs')
      .set('Origin', 'http://localhost:3000').expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000');
    await request(app.getHttpServer()).options('/api/runs')
      .set('Origin', 'http://evil.example').expect(204)
      .expect(({ headers }) => expect(headers['access-control-allow-origin']).toBeUndefined());

    await post('/api/runs').send({ provider: 'e2e', model: 'synthetic', status: 'success',
      durationMs: 1, startedAt: new Date().toISOString(), oversized: 'x'.repeat(2_000) }).expect(413);

    process.env.API_RATE_LIMIT_MAX = '1';
    app.get(ApiRateLimitGuard).clearForTests();
    await get('/api/runs').expect(200);
    await get('/api/runs').expect(429)
      .expect(({ headers }) => expect(headers['retry-after']).toBeTruthy());
  });

  it('rejects expired tokens', async () => {
    const parts = token.split('.');
    const claims = { ...JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()), exp: 1 };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const unsigned = `${parts[0]}.${payload}`;
    const expired = `${unsigned}.${createHmac('sha256', process.env.AUTH_TOKEN_SECRET!).update(unsigned).digest('base64url')}`;
    await get('/api/runs', expired).expect(401);
  });
});
