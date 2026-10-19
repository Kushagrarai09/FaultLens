import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const poolEnd = vi.fn().mockResolvedValue(undefined);
const poolInstances: Array<{ query: typeof poolQuery; end: typeof poolEnd }> = [];

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = poolQuery;
    end = poolEnd;
    constructor(_options?: { connectionString?: string; max?: number }) {
      poolInstances.push(this);
    }
  },
}));

import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  let originalDatabaseUrl: string | undefined;
  let originalAuthTokenSecret: string | undefined;

  beforeEach(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalAuthTokenSecret = process.env.AUTH_TOKEN_SECRET;
    vi.clearAllMocks();
    poolInstances.length = 0;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAuthTokenSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
    else process.env.AUTH_TOKEN_SECRET = originalAuthTokenSecret;
  });

  it('fails closed with a sanitized 503 when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    const service = new DatabaseService();
    await expect(service.query('SELECT 1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.query('SELECT 1')).rejects.toThrow('Database is not configured.');
    expect(poolInstances).toHaveLength(0);
  });

  it('passes parameterized SQL and values to the pool and closes it on shutdown', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.AUTH_TOKEN_SECRET = 'random-test-secret-with-sufficient-length-for-validation';
    poolQuery.mockResolvedValueOnce({ rows: [{ value: 1 }] });
    const service = new DatabaseService();
    const result = await service.query('SELECT $1::integer AS value', [1]);
    expect(poolQuery).toHaveBeenCalledWith('SELECT $1::integer AS value', [1]);
    expect(result.rows).toEqual([{ value: 1 }]);
    await service.onModuleDestroy();
    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it('checks PostgreSQL connectivity with a bounded SELECT 1 query', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.AUTH_TOKEN_SECRET = 'random-test-secret-with-sufficient-length-for-validation';
    poolQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const service = new DatabaseService();
    await expect(service.healthCheck()).resolves.toBeUndefined();
    expect(poolQuery).toHaveBeenCalledWith(expect.objectContaining({
      text: 'SELECT 1',
      query_timeout: 1_000,
    }));
  });

  it('converts connectivity failures into a sanitized service-unavailable error', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    process.env.AUTH_TOKEN_SECRET = 'random-test-secret-with-sufficient-length-for-validation';
    poolQuery.mockRejectedValue(new Error('private socket or password details'));
    const service = new DatabaseService();
    let thrown: unknown;
    try {
      await service.healthCheck();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect(String(thrown)).toContain('PostgreSQL health check failed.');
    expect(String(thrown)).not.toContain('private socket');
    expect(String(thrown)).not.toContain('password');
  });

  it('maps database failures to a sanitized 503 without exposing query or credentials', async () => {
    process.env.DATABASE_URL = 'postgresql://user:secret-password@localhost:5432/test';
    process.env.AUTH_TOKEN_SECRET = 'random-test-secret-with-sufficient-length-for-validation';
    poolQuery.mockRejectedValue(new Error('password=secret-password private_table connection refused'));
    const service = new DatabaseService();
    let thrown: unknown;
    try {
      await service.query('SELECT private_value FROM private_table');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect(String(thrown)).not.toContain('secret-password');
    expect(String(thrown)).not.toContain('private_table');
    expect(poolQuery).toHaveBeenCalledOnce();
  });
});
