import { afterEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns liveness without checking dependencies', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { readiness: vi.fn() } }],
    }).compile();
    const controller = module.get(HealthController);
    expect(controller.live()).toMatchObject({ status: 'ok', live: true, service: 'faultlens-api' });
    await module.close();
  });

  it('returns readiness details when both dependencies are healthy', async () => {
    const readiness = vi.fn().mockResolvedValue({
      status: 'ok', ready: true,
      dependencies: { postgres: { status: 'ok' }, ollama: { status: 'ok' } },
      timestamp: new Date().toISOString(),
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { readiness } }],
    }).compile();
    const controller = module.get(HealthController);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    await controller.ready(response);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ready: true }));
    await module.close();
  });

  it('returns 503 readiness when a dependency is down', async () => {
    const readiness = vi.fn().mockResolvedValue({
      status: 'error', ready: false,
      dependencies: { postgres: { status: 'error', message: 'PostgreSQL is unavailable.' }, ollama: { status: 'ok' } },
      timestamp: new Date().toISOString(),
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { readiness } }],
    }).compile();
    const controller = module.get(HealthController);
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    await controller.ready(response);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ready: false }));
    await module.close();
  });
});
