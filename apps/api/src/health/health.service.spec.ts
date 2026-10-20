import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthService } from './health.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('HealthService', () => {
  const healthCheck = vi.fn();
  const service = new HealthService({ healthCheck } as unknown as DatabaseService);
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.OLLAMA_BASE_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAuthTokenSecret = process.env.AUTH_TOKEN_SECRET;
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://faultlens:password@localhost:5432/faultlens_test';
    process.env.AUTH_TOKEN_SECRET = 'random-test-secret-with-sufficient-length-for-validation';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalBaseUrl;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAuthTokenSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = originalAuthTokenSecret;
    vi.clearAllMocks();
  });

  it('reports database failure without leaking driver details', async () => {
    healthCheck.mockRejectedValue(new Error('password=secret db-host-01'));
    await expect(service.checkDatabase()).resolves.toEqual({
      status: 'error', message: 'PostgreSQL is unavailable.',
    });
  });

  it('reports Ollama unavailable when the health endpoint refuses connection', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused')) as typeof fetch;
    await expect(service.checkOllama()).resolves.toEqual({
      status: 'error', message: 'Ollama is unavailable or timed out.',
    });
  });

  it('reports a non-success Ollama HTTP response as unhealthy', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('private details', { status: 500 })) as typeof fetch;
    await expect(service.checkOllama()).resolves.toEqual({
      status: 'error', message: 'Ollama returned an unsuccessful health response.',
    });
  });

  it('returns readiness false when either dependency is down', async () => {
    healthCheck.mockResolvedValue(undefined);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
    const result = await service.readiness();
    expect(result.ready).toBe(false);
    expect(result.dependencies.ollama.status).toBe('error');
    expect(result.dependencies.postgres.status).toBe('ok');
  });
});
