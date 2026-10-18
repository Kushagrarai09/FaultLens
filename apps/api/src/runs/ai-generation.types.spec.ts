import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseGenerateAiInput } from './ai-generation.types.js';

describe('parseGenerateAiInput', () => {
  it('trims and accepts valid model and prompt', () => {
    expect(parseGenerateAiInput({ model: ' qwen2.5:3b ', prompt: ' Explain observability ' }))
      .toEqual({ model: 'qwen2.5:3b', prompt: 'Explain observability' });
  });

  it('rejects missing, empty, non-string, and overlong inputs', () => {
    const badInputs = [
      null, [], {}, { model: 'm', prompt: '  ' }, { model: '', prompt: 'x' },
      { model: 'm', prompt: 42 }, { model: 'm', prompt: 'x'.repeat(12_001) },
      { model: 'm'.repeat(161), prompt: 'x' },
    ];
    for (const input of badInputs) expect(() => parseGenerateAiInput(input)).toThrow(BadRequestException);
  });
});
