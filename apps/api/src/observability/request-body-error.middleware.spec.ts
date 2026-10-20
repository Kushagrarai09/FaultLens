import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestBodyErrorMiddleware } from './request-body-error.middleware.js';

function responseMock() {
  const state: { status?: number; body?: unknown } = {};
  const response = {
    getHeader: (name: string) => name === 'X-Request-Id' ? 'req-body-test' : undefined,
    status: vi.fn((status: number) => { state.status = status; return response; }),
    json: vi.fn((body: unknown) => { state.body = body; return response; }),
  };
  return { response: response as unknown as Response, state };
}

describe('requestBodyErrorMiddleware', () => {
  it('returns a sanitized 413 for oversized JSON payloads', () => {
    const { response, state } = responseMock();
    requestBodyErrorMiddleware({ type: 'entity.too.large', message: 'secret payload detail' }, {} as Request, response, vi.fn() as NextFunction);
    expect(state.status).toBe(413);
    expect(JSON.stringify(state.body)).not.toContain('secret payload detail');
    expect(JSON.stringify(state.body)).toContain('req-body-test');
  });

  it('returns a generic 400 for malformed JSON', () => {
    const { response, state } = responseMock();
    requestBodyErrorMiddleware({ type: 'entity.parse.failed', body: 'password=secret' }, {} as Request, response, vi.fn() as NextFunction);
    expect(state.status).toBe(400);
    expect(JSON.stringify(state.body)).not.toContain('password=secret');
  });

  it('does not expose details for unexpected parser errors', () => {
    const { response, state } = responseMock();
    requestBodyErrorMiddleware(new Error('private driver data'), {} as Request, response, vi.fn() as NextFunction);
    expect(state.status).toBe(400);
    expect(JSON.stringify(state.body)).not.toContain('private driver data');
  });

  it('continues when no middleware error is present', () => {
    const { response } = responseMock();
    const next = vi.fn();
    requestBodyErrorMiddleware(undefined, {} as Request, response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
