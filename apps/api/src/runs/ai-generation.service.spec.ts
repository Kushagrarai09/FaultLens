import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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

  it('calls Ollama and persists metadata without passing prompt text to storage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: 'Hello from a local model', done: true, prompt_eval_count: 12, eval_count: 5,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const result = await service.generate({ model: 'qwen2.5:3b', prompt: 'A private test prompt' });

    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ model: 'qwen2.5:3b', prompt: 'A private test prompt', stream: false }),
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama', model: 'qwen2.5:3b', status: 'success',
      inputTokens: 12, outputTokens: 5, errorCode: null,
    }));
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('A private test prompt');
    expect(result.response).toBe('Hello from a local model');
  });

  it('records a sanitized failure when Ollama is unavailable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('connection refused with secret details')) as typeof fetch;
    create.mockResolvedValue({ id: 'failure-run-id', status: 'failure' });

    await expect(service.generate({ model: 'missing-model', prompt: 'test prompt' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_UNAVAILABLE', runId: 'failure-run-id' }) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'ollama', model: 'missing-model', status: 'failure',
      inputTokens: null, outputTokens: null, errorCode: 'OLLAMA_UNAVAILABLE',
    }));
  });

  it('records an HTTP failure without exposing upstream response details', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('internal upstream detail', { status: 500 })) as typeof fetch;
    create.mockResolvedValue({ id: 'http-failure-id', status: 'failure' });

    await expect(service.generate({ model: 'qwen2.5:3b', prompt: 'test' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'OLLAMA_HTTP_ERROR' }) });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure', errorCode: 'OLLAMA_HTTP_ERROR' }));
  });
});
