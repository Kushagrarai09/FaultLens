import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AiRunsController } from './ai-runs.controller.js';
import type { AiRunsService } from './ai-runs.service.js';

describe('AiRunsController', () => {
  const service = {
    create: vi.fn(),
    list: vi.fn(),
    findById: vi.fn(),
  };
  const controller = new AiRunsController(service as unknown as AiRunsService);

  it('validates and forwards a synthetic run to the service', async () => {
    service.create.mockResolvedValue({ id: 'run-id' });
    const result = await controller.create({
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
    );
    expect(result).toEqual({ id: 'run-id' });
  });

  it('rejects invalid run data before calling the service', async () => {
    await expect(
      controller.create({
        provider: '',
        model: 'demo-model',
        status: 'success',
        durationMs: 100,
        startedAt: '2026-10-17T12:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('applies default pagination values', async () => {
    service.list.mockResolvedValue({ data: [], pagination: { limit: 20, offset: 0 } });
    await controller.list();
    expect(service.list).toHaveBeenCalledWith(20, 0);
  });

  it('rejects invalid pagination values', () => {
    expect(() => controller.list('1000', '0')).toThrow(BadRequestException);
    expect(() => controller.list('20', '-1')).toThrow(BadRequestException);
  });
});
