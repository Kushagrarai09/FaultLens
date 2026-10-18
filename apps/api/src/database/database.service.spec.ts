import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
const poolEnd = vi.fn().mockResolvedValue(undefined);
const poolInstances: Array<{ query: typeof poolQuery; end: typeof poolEnd }> = [];

vi.mock('pg', () => ({
  Pool: class MockPool {
    query = poolQuery;
    end = poolEnd;
    constructor(_options?: unknown) { poolInstances.push(this); }
  },
}));

import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    vi.clearAllMocks();
    poolInstances.length = 0;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it('fails closed with a sanitized 503 when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    const service = new DatabaseService();
    await expect(service.query('SELECT 1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.query('SELECT 1')).rejects.toThrow('Database is not configured.');
    expect(poolInstances).toHaveLength(0);
  });

  it('passes parameterized SQL and values through to the pool', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test';
    poolQuery.mockResolvedValueOnce({ rows: [{ value: 1 }] });
    const service = new DatabaseService();
    const result = await service.query('SELECT $1::integer AS value', [1]);
    expect(poolQuery).toHaveBeenCalledWith('SELECT $1::integer AS value', [1]);
    expect(result.rows).toEqual([{ value: 1 }]);
    await service.onModuleDestroy();
    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it('maps database connection failures to a sanitized 503 without exposing SQL or credentials', async () => {
    process.env.DATABASE_URL = 'postgresql://user:secret-password@localhost:5432/test';
    poolQuery.mockRejectedValueOnce(new Error('password=secret-password SQL SELECT private_table'));
    const service = new DatabaseService();
    await expect(service.query('SELECT private_value FROM private_table')).rejects.toBeInstanceOf(ServiceUnavailableException);
    try {
      await service.query('SELECT private_value FROM private_table');
    } catch (error) {
      expect(String(error)).not.toContain('secret-password');
      expect(String(error)).not.toContain('private_table');
    }
  });
});
