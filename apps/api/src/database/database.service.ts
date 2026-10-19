import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
  ConflictException,
  type OnModuleInit,
} from '@nestjs/common';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadApiConfiguration } from '../common/configuration.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const config = loadApiConfiguration();
    this.pool = connectionString
      ? new Pool({
          connectionString,
          max: Number(process.env.PG_POOL_MAX ?? 10),
          connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 2_000),
          idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
          query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS ?? 5_000),
          statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 5_000),
        })
      : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) return;
    // Fail fast on bad DB configuration instead of serving a half-working API.
    await this.healthCheck();
  }

  async healthCheck(): Promise<void> {
    if (!this.pool) {
      throw new ServiceUnavailableException('Database is not configured. Set DATABASE_URL.');
    }
    try {
      await this.pool.query({ text: 'SELECT 1', query_timeout: Number(process.env.PG_HEALTH_TIMEOUT_MS ?? 1_000) });
    } catch {
      throw new ServiceUnavailableException('PostgreSQL health check failed.');
    }
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: (string | number | boolean | null)[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new ServiceUnavailableException(
        'Database is not configured. Set DATABASE_URL and run the SQL migration.',
      );
    }

    try {
      return await this.pool.query<T>(text, values);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        throw new ConflictException('A resource with these details already exists.');
      }
      throw new ServiceUnavailableException(
        'The database request failed. Check the database connection and migration.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
