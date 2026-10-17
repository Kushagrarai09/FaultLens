import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseGenerateAiInput } from './ai-generation.types.js';

describe('parseGenerateAiInput', () => {
  it('trims and accepts a valid model and prompt', () => {
    expect(parseGenerateAiInput({ model: ' qwen2.5:3b ', prompt: ' Explain observability ' }))
      .toEqual({ model: 'qwen2.5:3b', prompt: 'Explain observability' });
  });

  it('rejects an empty prompt', () => {
    expect(() => parseGenerateAiInput({ model: 'qwen2.5:3b', prompt: '  ' }))
      .toThrow(BadRequestException);
  });

  it('rejects a prompt that exceeds the request limit', () => {
    expect(() => parseGenerateAiInput({ model: 'qwen2.5:3b', prompt: 'x'.repeat(12_001) }))
      .toThrow(BadRequestException);
  });
});
