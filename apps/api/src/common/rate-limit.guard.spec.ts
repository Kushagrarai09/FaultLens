import { describe, expect, it, vi } from 'vitest';
import { TooManyRequestsException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';

function contextFor(method: string, route: string, ip = '127.0.0.1') {
  const headers: Record<string, string> = {};
  const request = { method, route: { path: route }, path: route, ip, socket: { remoteAddress: ip }, headers };
  const response = { setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }) };
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

describe('RateLimitGuard', () => {
  it('adds rate-limit headers and rejects requests over the configured limit', () => {
    process.env.API_RATE_LIMIT_MAX = '1';
    const guard = new RateLimitGuard();
    const first = contextFor('GET', '/api/runs');
    const second = contextFor('GET', '/api/runs');

    expect(guard.canActivate(first.context)).toBe(true);
    expect(first.headers['X-RateLimit-Limit']).toBe('1');
    expect(first.headers['X-RateLimit-Remaining']).toBe('0');
    expect(() => guard.canActivate(second.context)).toThrow(TooManyRequestsException);

    delete process.env.API_RATE_LIMIT_MAX;
  });

  it('rejects invalid rate-limit configuration explicitly', () => {
    process.env.API_RATE_LIMIT_MAX = '-1';
    const guard = new RateLimitGuard();
    expect(() => guard.canActivate(contextFor('GET', '/api/runs').context)).toThrow(/API_RATE_LIMIT_MAX/);
    delete process.env.API_RATE_LIMIT_MAX;
  });
});
