import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeLogValue } from './structured-logger.js';

describe('StructuredLogger sanitization', () => {
  it('redacts secrets, request payloads, and prompt/response content', () => {
    const output = sanitizeLogValue({
      authorization: 'Bearer super-secret',
      password: 'user-password',
      apiKey: 'private-key',
      prompt: 'do not log this prompt',
      response: 'do not log this response',
      metadata: { safe: 'visible', accessToken: 'hidden' },
    });
    const text = JSON.stringify(output);
    expect(text).not.toContain('super-secret');
    expect(text).not.toContain('user-password');
    expect(text).not.toContain('private-key');
    expect(text).not.toContain('do not log this prompt');
    expect(text).not.toContain('do not log this response');
    expect(text).toContain('visible');
    expect(text).toContain('[REDACTED]');
  });

  it('removes credentials embedded in database URLs', () => {
    const output = JSON.stringify(sanitizeLogValue({ detail: 'postgresql://alice:hunter2@db.internal:5432/app' }));
    expect(output).not.toContain('hunter2');
    expect(output).toContain('://[REDACTED]@');
  });
});
