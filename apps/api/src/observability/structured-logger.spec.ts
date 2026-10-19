import { describe, expect, it } from 'vitest';
import { redactLogMessage } from './structured-logger.js';

describe('redactLogMessage', () => {
  it('redacts database URL credentials, bearer tokens, and inline secrets', () => {
    const output = redactLogMessage(
      'postgresql://alice:hunter2@db.internal:5432/app Bearer abc.def.ghi password=private token=secret api_key=hidden',
    );
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('abc.def.ghi');
    expect(output).not.toContain('password=private');
    expect(output).not.toContain('token=secret');
    expect(output).not.toContain('api_key=hidden');
    expect(output).toContain('[REDACTED]');
  });

  it('bounds arbitrary log messages', () => {
    expect(redactLogMessage('x'.repeat(2_000))).toHaveLength(500);
  });
});
