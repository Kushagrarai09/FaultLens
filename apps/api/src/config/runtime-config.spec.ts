import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const baseEnv = () => ({
  AUTH_TOKEN_SECRET: 'random-test-secret-that-is-long-enough-to-pass-validation-value',
  DATABASE_URL: 'postgresql://faultlens:password@localhost:5432/faultlens_test',
});

describe('loadRuntimeConfig', () => {
  it('loads safe defaults for body limits, CORS, and request timeout', () => {
    expect(loadRuntimeConfig(baseEnv())).toMatchObject({
      port: 3001,
      requestTimeoutMs: 65_000,
      bodyLimitBytes: 262_144,
      allowedOrigins: ['http://localhost:3000'],
      rateLimitMax: 120,
      authRateLimitMax: 10,
      generationRateLimitMax: 20,
    });
  });

  it('rejects missing/weak secrets and invalid PostgreSQL URLs', () => {
    expect(() => loadRuntimeConfig({ DATABASE_URL: 'postgresql://localhost/db' })).toThrow(/AUTH_TOKEN_SECRET/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), AUTH_TOKEN_SECRET: 'short' })).toThrow(/AUTH_TOKEN_SECRET/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), DATABASE_URL: 'http://localhost/db' })).toThrow(/DATABASE_URL/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid ports, timeouts, body-size limits, and rate settings', () => {
    expect(() => loadRuntimeConfig({ ...baseEnv(), PORT: '99999' })).toThrow(/PORT/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), API_BODY_LIMIT_BYTES: '512.5' })).toThrow(/API_BODY_LIMIT_BYTES/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), API_REQUEST_TIMEOUT_MS: '99' })).toThrow(/API_REQUEST_TIMEOUT_MS/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), AUTH_RATE_LIMIT_MAX: '0' })).toThrow(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), PG_QUERY_TIMEOUT_MS: '999999' })).toThrow(/PG_QUERY_TIMEOUT_MS/);
  });

  it('rejects wildcard, non-origin, and credential-bearing service URLs', () => {
    expect(() => loadRuntimeConfig({ ...baseEnv(), CORS_ALLOWED_ORIGINS: '*' })).toThrow(/wildcard/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), CORS_ALLOWED_ORIGINS: 'https://example.com/path' })).toThrow(/exact HTTP\\(S\\) origin/);
    expect(() => loadRuntimeConfig({ ...baseEnv(), OLLAMA_BASE_URL: 'http://alice:secret@localhost:11434' })).toThrow(/credentials/);
  });
});
