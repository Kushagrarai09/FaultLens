import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestTimeoutMiddleware } from './request-timeout.middleware.js';

describe('requestTimeoutMiddleware', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a sanitized 408 when a request exceeds its timeout', () => {
    vi.useFakeTimers();
    const state: { status?: number; body?: unknown } = {};
    const listeners: Record<string, () => void> = {};
    const response = {
      writableEnded: false,
      headersSent: false,
      getHeader: (name: string) => name === 'X-Request-Id' ? 'req-timeout-test' : undefined,
      status: vi.fn((status: number) => { state.status = status; return response; }),
      json: vi.fn((body: unknown) => { state.body = body; return response; }),
      on: vi.fn((event: string, handler: () => void) => { listeners[event] = handler; return response; }),
    };
    requestTimeoutMiddleware(100)( {} as Request, response as unknown as Response, vi.fn() as NextFunction);
    vi.advanceTimersByTime(100);
    expect(state.status).toBe(408);
    expect(JSON.stringify(state.body)).toContain('req-timeout-test');
    expect(JSON.stringify(state.body)).not.toContain('stack');
  });

  it('clears the timeout when the response finishes', () => {
    vi.useFakeTimers();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    let finish: (() => void) | undefined;
    const response = {
      writableEnded: false,
      headersSent: false,
      getHeader: () => 'req-finish',
      status,
      json,
      on: vi.fn((event: string, handler: () => void) => { if (event === 'finish') finish = handler; return response; }),
    };
    requestTimeoutMiddleware(100)( {} as Request, response as unknown as Response, vi.fn() as NextFunction);
    finish?.();
    vi.advanceTimersByTime(100);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
