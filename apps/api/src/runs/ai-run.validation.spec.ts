import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseCreateAiRunInput } from './ai-run.validation.js';

describe('parseCreateAiRunInput', () => {
  const validInput = {
    provider: 'demo-provider',
    model: 'demo-model',
    status: 'success',
    durationMs: 420,
    inputTokens: 12,
    outputTokens: 34,
    startedAt: '2026-10-17T12:00:00.000Z',
  };

  it('accepts valid synthetic run metadata', () => {
    expect(parseCreateAiRunInput(validInput)).toMatchObject({
      provider: 'demo-provider',
      model: 'demo-model',
      status: 'success',
      durationMs: 420,
      inputTokens: 12,
      outputTokens: 34,
      errorCode: null,
    });
  });

  it('normalizes surrounding whitespace and date values', () => {
    const parsed = parseCreateAiRunInput({
      ...validInput,
      provider: ' demo-provider ',
      startedAt: '2026-10-17T12:00:00Z',
    });
    expect(parsed.provider).toBe('demo-provider');
    expect(parsed.startedAt).toBe('2026-10-17T12:00:00.000Z');
  });

  it('rejects unsupported statuses', () => {
    expect(() => parseCreateAiRunInput({ ...validInput, status: 'pending' }))
      .toThrow(BadRequestException);
  });

  it('rejects negative duration and token counts', () => {
    expect(() => parseCreateAiRunInput({ ...validInput, durationMs: -1 }))
      .toThrow(BadRequestException);
    expect(() => parseCreateAiRunInput({ ...validInput, inputTokens: -1 }))
      .toThrow(BadRequestException);
  });

  it('rejects a non-object body', () => {
    expect(() => parseCreateAiRunInput(null)).toThrow(BadRequestException);
  });
});
