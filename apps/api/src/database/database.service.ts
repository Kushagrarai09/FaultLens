import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadRuntimeConfig } from '../config/runtime-config.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;
  private readonly healthTimeoutMs: number;

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    let config: ReturnType<typeof loadRuntimeConfig> | null = null;
    if (rawUrl) config = loadRuntimeConfig();
    this.healthTimeoutMs = config?.pgHealthTimeoutMs ?? 1_000;
    this.pool = rawUrl && config
      ? new Pool({
          connectionString: config.databaseUrl,
          max: config.pgPoolMax,
          connectionTimeoutMillis: config.pgConnectTimeoutMs,
          idleTimeoutMillis: config.pgIdleTimeoutMs,
          query_timeout: config.pgQueryTimeoutMs,
          statement_timeout: config.pgStatementTimeoutMs,
        })
      : null;
  }

  async healthCheck(): Promise<void> {
    if (!this.pool) {
      throw new ServiceUnavailableException('Database is not configured. Set DATABASE_URL.');
    }

    try {
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.pool.query('SELECT 1'),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('PostgreSQL health check timed out.')), this.healthTimeoutMs);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    } catch {
      throw new ServiceUnavailableException('PostgreSQL health check failed.');
    }
  }

  async assertSchemaReady(): Promise<void> {
    const requiredTables = [
      'users', 'workspaces', 'workspace_members', 'ai_runs', 'prompt_templates',
      'prompt_versions', 'evaluation_datasets', 'evaluation_cases', 'evaluation_runs',
      'evaluation_results', 'alert_rules',
    ];
    try {
      const result = await this.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN (${requiredTables.map((table) => `'${table}'`).join(', ')})`,
      );
      const found = new Set(result.rows.map((row) => row.table_name));
      const missing = requiredTables.filter((table) => !found.has(table));
      if (missing.length) {
        throw new Error(`missing tables: ${missing.join(', ')}`);
      }
    } catch {
      throw new ServiceUnavailableException(
        'Database schema is not ready. Run "pnpm --filter api db:migrate" and restart the API.',
      );
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
