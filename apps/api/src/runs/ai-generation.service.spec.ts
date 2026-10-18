import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException } from '@nestjs/common';
import { AiGenerationService } from './ai-generation.service.js';
import type { AiRunsService } from './ai-runs.service.js';

describe('AiGenerationService', () => {
  const create = vi.fn();
  const service = new AiGenerationService({ create } as unknown as AiRunsService);
  const originalFetch = globalThis.fetch;
  const savedBaseUrl = process.env.OLLAMA_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/';
    create.mockResolvedValue({ id: 'saved-run-id', status: 'success' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = savedBaseUrl;
  });

  it('stores run metadata and maps Ollama prompt_eval_count/eval_count to token fields', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: 'Hello from a local model', done: true, prompt_eval_count: 12, eval_count: 5,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const result = await service.generate({ model: 'qwen2.5:3b', prompt: 'A private test prompt' });
    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ model: 'qwen2.5:3b', prompt: 'A private test prompt', stream: false }),
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama', model: 'qwen2.5:3b', status: 'success', inputTokens: 12, outputTokens: 5, errorCode: null,
    }));
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('A private test prompt');
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('Hello from a local model');
    expect(result.response).toBe('Hello from a local model');
    expect(result.run.inputTokens).toBeUndefined();
  });

  it('stores sanitized failure metadata when provider is unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('connection refused with secret details')) as typeof fetch;
    create.mockResolvedValue({ id: 'failure-run-id', status: 'failure' });
    await expect(service.generate({ model: 'missing-model', prompt: 'test prompt' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_UNAVAILABLE', runId: 'failure-run-id' }) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama', model: 'missing-model', status: 'failure', inputTokens: null, outputTokens: null,
      errorCode: 'OLLAMA_UNAVAILABLE',
    }));
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('connection refused');
  });

  it('stores timeout failures without persisting a raw exception message', async () => {
    const timeout = new Error('private timeout detail');
    timeout.name = 'TimeoutError';
    globalThis.fetch = vi.fn().mockRejectedValue(timeout) as typeof fetch;
    create.mockResolvedValue({ id: 'timeout-run-id', status: 'failure' });

    await expect(service.generate({ model: 'qwen2.5:3b', prompt: 'test' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_TIMEOUT' }) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure', errorCode: 'OLLAMA_TIMEOUT', inputTokens: null, outputTokens: null,
    }));
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('private timeout detail');
  });

  it('sanitizes upstream HTTP errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('internal upstream detail', { status: 500 })) as typeof fetch;
    create.mockResolvedValue({ id: 'http-failure-id', status: 'failure' });

    await expect(service.generate({ model: 'qwen2.5:3b', prompt: 'test' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_HTTP_ERROR' }) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure', errorCode: 'OLLAMA_HTTP_ERROR' }));
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('internal upstream detail');
  });

  it('sanitizes invalid JSON and incomplete provider responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })) as typeof fetch;
    create.mockResolvedValue({ id: 'bad-json-run', status: 'failure' });

    await expect(service.generate({ model: 'qwen2.5:3b', prompt: 'test' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_INVALID_RESPONSE' }) });

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ response: 'partial', done: false }), { status: 200 })) as typeof fetch;
    await expect(service.generate({ model: 'qwen2.5:3b', prompt: 'test' })).rejects.toBeInstanceOf(BadGatewayException);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.every(call => call[0].status === 'failure' && call[0].inputTokens === null)).toBe(true);
  });

  it('marks invalid or out-of-range provider usage counts as unknown', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: 'Response without usable usage counts', done: true,
      prompt_eval_count: 2_147_483_648, eval_count: 'not-a-number',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    await service.generate({ model: 'qwen2.5:3b', prompt: 'test' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: null, outputTokens: null }));
  });
});
