import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AiRunsService } from './ai-runs.service.js';

describe('AiRunsService', () => {
  const query = vi.fn();
  let service: AiRunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AiRunsService({ query } as never);
  });

  it('stores only run metadata and returns database timestamps as ISO strings', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'run-uuid', provider: 'ollama', model: 'qwen2.5:3b', status: 'success',
      duration_ms: 1200, input_tokens: 12, output_tokens: 8, error_code: null,
      started_at: new Date('2026-10-18T01:00:00.000Z'),
      created_at: new Date('2026-10-18T01:00:01.000Z'),
    }] });

    const result = await service.create({
      provider: 'ollama', model: 'qwen2.5:3b', status: 'success',
      durationMs: 1200, inputTokens: 12, outputTokens: 8, startedAt: '2026-10-18T01:00:00.000Z',
    }, 'workspace-uuid');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_runs'),
      ['workspace-uuid', 'ollama', 'qwen2.5:3b', 'success', 1200, 12, 8, null, '2026-10-18T01:00:00.000Z']);
    expect(result).toMatchObject({
      id: 'run-uuid', provider: 'ollama', model: 'qwen2.5:3b',
      status: 'success', durationMs: 1200, inputTokens: 12, outputTokens: 8,
    });
    expect(result.startedAt).toBe('2026-10-18T01:00:00.000Z');
  });

  it('normalizes omitted usage and error fields to database nulls', async () => {
    query.mockResolvedValueOnce({ rows: [{
      id: 'run-uuid', provider: 'synthetic', model: 'test-model', status: 'failure',
      duration_ms: 1, input_tokens: null, output_tokens: null, error_code: null,
      started_at: new Date('2026-10-18T01:00:00.000Z'), created_at: new Date('2026-10-18T01:00:01.000Z'),
    }] });
    await service.create({ provider: 'synthetic', model: 'test-model', status: 'failure', durationMs: 1, startedAt: '2026-10-18T01:00:00.000Z' }, 'workspace-uuid');
    expect(query.mock.calls[0][1]).toEqual(['workspace-uuid', 'synthetic', 'test-model', 'failure', 1, null, null, null, '2026-10-18T01:00:00.000Z']);
  });

  it('returns runs in descending creation order with bounded query parameters', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const result = await service.list('workspace-uuid', 10, 20);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY created_at DESC'), ['workspace-uuid', 10, 20]);
    expect(result).toEqual({ data: [], pagination: { limit: 10, offset: 20 } });
  });

  it('throws a not-found exception for missing run IDs', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.findById('missing-id', 'workspace-uuid')).rejects.toBeInstanceOf(NotFoundException);
  });
});
