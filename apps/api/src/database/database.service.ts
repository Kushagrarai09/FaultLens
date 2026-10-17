import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    this.pool = connectionString
      ? new Pool({ connectionString, max: 10 })
      : null;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new ServiceUnavailableException(
        'Database is not configured. Set DATABASE_URL and run the SQL migration.',
      );
    }

    try {
      return await this.pool.query<T>(text, values);
    } catch {
      throw new ServiceUnavailableException(
        'The database request failed. Check the database connection and migration.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
