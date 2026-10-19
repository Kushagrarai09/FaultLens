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

  async create(input: CreateAiRunInput, workspaceId: string): Promise<AiRunRecord> {
    const result = await this.database.query<AiRunRow>(
      `INSERT INTO ai_runs
        (workspace_id, provider, model, status, duration_ms, input_tokens, output_tokens, error_code, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, provider, model, status, duration_ms, input_tokens, output_tokens,
                 error_code, started_at, created_at`,
      [
        workspaceId,
        input.provider,
        input.model,
        input.status,
        input.durationMs,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.errorCode ?? null,
        input.startedAt,
      ],
    );

    return toRecord(result.rows[0]);
  }

  async list(
    workspaceId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ data: AiRunRecord[]; pagination: { limit: number; offset: number } }> {
    const result = await this.database.query<AiRunRow>(
      `SELECT id, provider, model, status, duration_ms, input_tokens, output_tokens,
              error_code, started_at, created_at
       FROM ai_runs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, limit, offset],
    );

    return { data: result.rows.map(toRecord), pagination: { limit, offset } };
  }

  async findById(id: string, workspaceId: string): Promise<AiRunRecord> {
    const result = await this.database.query<AiRunRow>(
      `SELECT id, provider, model, status, duration_ms, input_tokens, output_tokens,
              error_code, started_at, created_at
       FROM ai_runs WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId],
    );

    if (!result.rows[0]) {
      // Use the same response for missing and cross-workspace IDs so resource
      // existence cannot be inferred by another workspace.
      throw new NotFoundException('AI run was not found.');
    }

    return toRecord(result.rows[0]);
  }
}
