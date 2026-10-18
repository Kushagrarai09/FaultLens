import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseCreateAiRunInput } from './ai-run.validation.js';

describe('parseCreateAiRunInput', () => {
  const validInput = {
    provider: 'demo-provider', model: 'demo-model', status: 'success',
    durationMs: 420, inputTokens: 12, outputTokens: 34, startedAt: '2026-10-17T12:00:00.000Z',
  };

  it('accepts valid metadata and supplies nullable defaults', () => {
    expect(parseCreateAiRunInput(validInput)).toMatchObject({
      provider: 'demo-provider', model: 'demo-model', status: 'success', durationMs: 420,
      inputTokens: 12, outputTokens: 34, errorCode: null,
    });
    expect(parseCreateAiRunInput({ ...validInput, inputTokens: undefined, outputTokens: null }))
      .toMatchObject({ inputTokens: null, outputTokens: null });
  });

  it('normalizes whitespace and timestamps', () => {
    expect(parseCreateAiRunInput({ ...validInput, provider: ' demo-provider ', startedAt: '2026-10-17T12:00:00Z' }))
      .toMatchObject({ provider: 'demo-provider', startedAt: '2026-10-17T12:00:00.000Z' });
  });

  it('rejects unsupported statuses, negative values, and non-integers', () => {
    for (const bad of [
      { ...validInput, status: 'pending' },
      { ...validInput, durationMs: -1 },
      { ...validInput, durationMs: 1.5 },
      { ...validInput, inputTokens: -1 },
      { ...validInput, outputTokens: 1.5 },
      { ...validInput, inputTokens: 2_147_483_648 },
    ]) expect(() => parseCreateAiRunInput(bad)).toThrow(BadRequestException);
  });

  it('rejects out-of-range values, invalid dates, and oversized metadata', () => {
    for (const bad of [
      { ...validInput, durationMs: 86_400_001 },
      { ...validInput, startedAt: 'not-a-date' },
      { ...validInput, provider: 'x'.repeat(81) },
      { ...validInput, errorCode: 'x'.repeat(121) },
    ]) expect(() => parseCreateAiRunInput(bad)).toThrow(BadRequestException);
  });

  it('rejects a non-object body', () => {
    expect(() => parseCreateAiRunInput(null)).toThrow(BadRequestException);
  });
});
