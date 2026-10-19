import { describe, expect, it } from 'vitest';
import { loadApiConfiguration } from './configuration.js';

const baseEnv = () => ({
  AUTH_TOKEN_SECRET: 'test-only-secret-with-more-than-32-characters',
});

describe('loadApiConfiguration', () => {
  it('returns safe local defaults when a valid token secret is configured', () => {
    const config = loadApiConfiguration(baseEnv());
    expect(config).toMatchObject({
      port: 3001,
      requestBodyLimit: '256kb',
      requestTimeoutMs: 65_000,
      corsOrigins: ['http://localhost:3000'],
      ollamaBaseUrl: 'http://localhost:11434',
    });
  });

  it('rejects a missing or weak authentication secret', () => {
    expect(() => loadApiConfiguration({})).toThrow(/AUTH_TOKEN_SECRET/);
    expect(() => loadApiConfiguration({ AUTH_TOKEN_SECRET: 'short' })).toThrow(/AUTH_TOKEN_SECRET/);
  });

  it('rejects invalid ports, request limits and timeouts', () => {
    expect(() => loadApiConfiguration({ ...baseEnv(), PORT: '99999' })).toThrow(/PORT/);
    expect(() => loadApiConfiguration({ ...baseEnv(), REQUEST_BODY_LIMIT: '0mb' })).toThrow(/REQUEST_BODY_LIMIT/);
    expect(() => loadApiConfiguration({ ...baseEnv(), HTTP_REQUEST_TIMEOUT_MS: '-1' })).toThrow(/HTTP_REQUEST_TIMEOUT_MS/);
  });

  it('rejects wildcard CORS origins and invalid service URLs', () => {
    expect(() => loadApiConfiguration({ ...baseEnv(), CORS_ORIGINS: '*' })).toThrow(/wildcard/);
    expect(() => loadApiConfiguration({ ...baseEnv(), DATABASE_URL: 'http://db.example' })).toThrow(/DATABASE_URL/);
    expect(() => loadApiConfiguration({ ...baseEnv(), OLLAMA_BASE_URL: 'file:///tmp/ollama' })).toThrow(/OLLAMA_BASE_URL/);
  });

  it('validates rate limits and PostgreSQL timeout ranges', () => {
    expect(() => loadApiConfiguration({ ...baseEnv(), AUTH_RATE_LIMIT_MAX: '0' })).toThrow(/AUTH_RATE_LIMIT_MAX/);
    expect(() => loadApiConfiguration({ ...baseEnv(), PG_QUERY_TIMEOUT_MS: '999999' })).toThrow(/PG_QUERY_TIMEOUT_MS/);
  });
});
