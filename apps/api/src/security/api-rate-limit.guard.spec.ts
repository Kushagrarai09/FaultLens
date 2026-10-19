import { afterEach, describe, expect, it } from 'vitest';
import { TooManyRequestsException } from '@nestjs/common';
import { ApiRateLimitGuard } from './api-rate-limit.guard.js';

function contextFor(path: string, method = 'GET', ip = '127.0.0.1') {
  const headers: Record<string, string> = {};
  const request = { method, path, ip, socket: { remoteAddress: ip } };
  const response = { setHeader(name: string, value: string) { headers[name] = value; }, getHeader(name: string) { return headers[name]; } };
  return {
    headers,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as never,
  };
}

describe('ApiRateLimitGuard', () => {
  afterEach(() => {
    delete process.env.API_RATE_LIMIT_MAX;
    delete process.env.API_RATE_LIMIT_WINDOW_MS;
    delete process.env.AUTH_RATE_LIMIT_MAX;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    delete process.env.GENERATION_RATE_LIMIT_MAX;
    delete process.env.GENERATION_RATE_LIMIT_WINDOW_MS;
  });

  it('adds headers and returns 429 after the default limit is exceeded', () => {
    process.env.API_RATE_LIMIT_MAX = '1';
    const guard = new ApiRateLimitGuard();
    const first = contextFor('/api/runs');
    const second = contextFor('/api/runs');

    expect(guard.canActivate(first.context)).toBe(true);
    expect(first.headers['RateLimit-Limit']).toBe('1');
    expect(first.headers['RateLimit-Remaining']).toBe('0');
    expect(() => guard.canActivate(second.context)).toThrow(TooManyRequestsException);
  });

  it('uses a stricter limit for login and registration', () => {
    process.env.API_RATE_LIMIT_MAX = '100';
    process.env.AUTH_RATE_LIMIT_MAX = '1';
    const guard = new ApiRateLimitGuard();
    expect(guard.canActivate(contextFor('/api/auth/login', 'POST').context)).toBe(true);
    expect(() => guard.canActivate(contextFor('/api/auth/login', 'POST').context)).toThrow(TooManyRequestsException);
  });

  it('uses a separate limit for generation requests', () => {
    process.env.API_RATE_LIMIT_MAX = '100';
    process.env.GENERATION_RATE_LIMIT_MAX = '1';
    const guard = new ApiRateLimitGuard();
    expect(guard.canActivate(contextFor('/api/ai/generate', 'POST').context)).toBe(true);
    expect(() => guard.canActivate(contextFor('/api/ai/generate', 'POST').context)).toThrow(TooManyRequestsException);
  });

  it('does not rate limit health probes', () => {
    process.env.API_RATE_LIMIT_MAX = '1';
    const guard = new ApiRateLimitGuard();
    const probe = contextFor('/health/live');
    expect(guard.canActivate(probe.context)).toBe(true);
    expect(guard.canActivate(probe.context)).toBe(true);
  });
});
