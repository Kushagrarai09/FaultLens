import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AiRunRecord, CreateAiRunInput } from './ai-run.types.js';

interface AiRunRow {
  id: string;
  provider: string;
  model: string;
  status: 'success' | 'failure';
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  error_code: string | null;
  started_at: Date;
  created_at: Date;
}

const toRecord = (row: AiRunRow): AiRunRecord => ({
  id: row.id,
  provider: row.provider,
  model: row.model,
  status: row.status,
  durationMs: row.duration_ms,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  errorCode: row.error_code,
  startedAt: row.started_at.toISOString(),
  createdAt: row.created_at.toISOString(),
});

@Injectable()
export class AiRunsService {
  constructor(private readonly database: DatabaseService) {}

  async create(input: CreateAiRunInput): Promise<AiRunRecord> {
    const result = await this.database.query<AiRunRow>(
      `INSERT INTO ai_runs
        (provider, model, status, duration_ms, input_tokens, output_tokens, error_code, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, provider, model, status, duration_ms, input_tokens, output_tokens,
                 error_code, started_at, created_at`,
      [
        input.provider,
        input.model,
        input.status,
        input.durationMs,
        input.inputTokens,
        input.outputTokens,
        input.errorCode,
        input.startedAt,
      ],
    );

    return toRecord(result.rows[0]);
  }

  async list(limit = 20, offset = 0): Promise<{ data: AiRunRecord[]; pagination: { limit: number; offset: number } }> {
    const result = await this.database.query<AiRunRow>(
      `SELECT id, provider, model, status, duration_ms, input_tokens, output_tokens,
              error_code, started_at, created_at
       FROM ai_runs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    return { data: result.rows.map(toRecord), pagination: { limit, offset } };
  }

  async findById(id: string): Promise<AiRunRecord> {
    const result = await this.database.query<AiRunRow>(
      `SELECT id, provider, model, status, duration_ms, input_tokens, output_tokens,
              error_code, started_at, created_at
       FROM ai_runs WHERE id = $1`,
      [id],
    );

    if (!result.rows[0]) {
      throw new NotFoundException(`AI run "${id}" was not found.`);
    }

    return toRecord(result.rows[0]);
  }
}
