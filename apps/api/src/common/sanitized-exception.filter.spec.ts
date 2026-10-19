import { ArgumentsHost, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SanitizedExceptionFilter } from './sanitized-exception.filter.js';

function mockHost(exception: unknown) {
  const body: { value?: unknown } = {};
  const status = { value: 0 };
  const response = {
    headersSent: false,
    status: vi.fn((value: number) => { status.value = value; return response; }),
    json: vi.fn((value: unknown) => { body.value = value; return response; }),
  };
  const request = { requestId: 'req-123', path: '/api/private', method: 'GET' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response, body, status };
}

describe('SanitizedExceptionFilter', () => {
  it('sanitizes 4xx response details and includes a request ID', () => {
    const filter = new SanitizedExceptionFilter();
    const state = mockHost(new BadRequestException({ message: 'secret body data', detail: 'private' }));
    filter.catch(new BadRequestException({ message: 'secret body data', detail: 'private' }), state.host);
    expect(state.status.value).toBe(400);
    const output = JSON.stringify(state.body.value);
    expect(output).not.toContain('secret body data');
    expect(output).not.toContain('private');
    expect(output).toContain('req-123');
  });

  it('never exposes internal exception text for server errors', () => {
    const filter = new SanitizedExceptionFilter();
    const error = new InternalServerErrorException('password=super-secret');
    const state = mockHost(error);
    filter.catch(error, state.host);
    expect(state.status.value).toBe(500);
    expect(JSON.stringify(state.body.value)).not.toContain('super-secret');
  });
});
