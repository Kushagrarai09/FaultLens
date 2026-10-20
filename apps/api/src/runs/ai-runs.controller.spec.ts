import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRunsController } from './ai-runs.controller.js';
import type { AiRunsService } from './ai-runs.service.js';

describe('AiRunsController', () => {
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
  };
  const controller = new AiRunsController(service as unknown as AiRunsService);
  const user = {
    userId: 'c2a1f93b-9c72-4e4b-98b4-57d4bc8e30d9',
    email: 'test@example.test',
    workspaceId: 'workspace-uuid',
    workspaceName: 'Test workspace',
    role: 'owner' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and forwards a synthetic run to the service', async () => {
    service.create.mockResolvedValue({ id: 'run-id' });
    const result = await controller.create(user, {
      provider: 'demo',
      model: 'demo-model',
      status: 'success',
      durationMs: 100,
      startedAt: '2026-10-17T12:00:00.000Z',
    });

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'demo',
        model: 'demo-model',
        status: 'success',
        durationMs: 100,
        inputTokens: null,
        outputTokens: null,
      }),
      'workspace-uuid',
    );
    expect(result).toEqual({ id: 'run-id' });
  });

  it('rejects invalid run data before calling the service', async () => {
    expect(() => controller.create(user, {
      provider: '',
      model: 'demo-model',
      status: 'success',
      durationMs: 100,
      startedAt: '2026-10-17T12:00:00.000Z',
    })).toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('applies default pagination values', async () => {
    service.list.mockResolvedValue({ data: [], pagination: { limit: 20, offset: 0 } });
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith('workspace-uuid', 20, 0);
  });

  it('rejects invalid pagination values', () => {
    expect(() => controller.list(user, '1000', '0')).toThrow(BadRequestException);
    expect(() => controller.list(user, '20', '-1')).toThrow(BadRequestException);
  });
});
