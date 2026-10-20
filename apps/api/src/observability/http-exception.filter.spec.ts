import { ArgumentsHost, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';

function createHost() {
  const state: { body?: unknown; status?: number } = {};
  const headers: Record<string, string> = { 'X-Request-Id': 'req-test-1' };
  const response = {
    headersSent: false,
    status: vi.fn((status: number) => { state.status = status; return response; }),
    json: vi.fn((body: unknown) => { state.body = body; return response; }),
    getHeader: (name: string) => headers[name],
    end: vi.fn(),
  };
  const request = { method: 'GET', path: '/api/private' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, state, response };
}

describe('HttpExceptionFilter', () => {
  it('returns a generic client error without reflecting request details', () => {
    const filter = new HttpExceptionFilter();
    const { host, state } = createHost();
    filter.catch(new BadRequestException({ message: 'private prompt data', authorization: 'Bearer secret' }), host);
    expect(state.status).toBe(400);
    const body = JSON.stringify(state.body);
    expect(body).not.toContain('private prompt data');
    expect(body).not.toContain('Bearer secret');
    expect(body).toContain('req-test-1');
  });

  it('does not expose internal exception messages for server errors', () => {
    const filter = new HttpExceptionFilter();
    const { host, state } = createHost();
    filter.catch(new InternalServerErrorException('password=private-secret'), host);
    expect(state.status).toBe(500);
    expect(JSON.stringify(state.body)).not.toContain('private-secret');
  });
});
