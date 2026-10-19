import { ServiceUnavailableException } from '@nestjs/common';

export interface RuntimeConfig {
  port: number;
  authTokenSecret: string;
  databaseUrl: string;
  ollamaBaseUrl: string;
  allowedOrigins: string[];
  requestTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  bodyLimitBytes: number;
}

const integer = (value: string | undefined, fallback: number, min: number, max: number, name: string): number => {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new ServiceUnavailableException('Configuration ' + name + ' must be an integer.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ServiceUnavailableException('Configuration ' + name + ' must be between ' + min + ' and ' + max + '.');
  }
  return parsed;
};

const httpUrl = (value: string, name: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ServiceUnavailableException('Configuration ' + name + ' must be an absolute URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServiceUnavailableException('Configuration ' + name + ' must use HTTP or HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new ServiceUnavailableException('Configuration ' + name + ' must not embed credentials in a URL.');
  }
  return parsed.toString().replace(/\/$/, '');
};

export const loadRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): RuntimeConfig => {
  const port = integer(env.PORT, 3001, 1, 65535, 'PORT');
  const requestTimeoutMs = integer(env.API_REQUEST_TIMEOUT_MS, 30_000, 1_000, 120_000, 'API_REQUEST_TIMEOUT_MS');
  const rateLimitWindowMs = integer(env.API_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000, 'API_RATE_LIMIT_WINDOW_MS');
  const rateLimitMax = integer(env.API_RATE_LIMIT_MAX, 100, 1, 10_000, 'API_RATE_LIMIT_MAX');
  const bodyLimitBytes = integer(env.API_BODY_LIMIT_BYTES, 1_048_576, 1_024, 10_485_760, 'API_BODY_LIMIT_BYTES');

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  let parsedDb: URL;
  try {
    parsedDb = new URL(databaseUrl);
  } catch {
    throw new ServiceUnavailableException('Configuration DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDb.protocol) || !parsedDb.hostname || !parsedDb.pathname.slice(1)) {
    throw new ServiceUnavailableException('Configuration DATABASE_URL must point to a PostgreSQL database.');
  }

  const authTokenSecret = env.AUTH_TOKEN_SECRET ?? '';
  if (authTokenSecret.length < 32 || /^(change.?me|replace|example|test|secret)$/i.test(authTokenSecret.trim())) {
    throw new ServiceUnavailableException('Configuration AUTH_TOKEN_SECRET must be a unique random secret of at least 32 characters.');
  }

  const ollamaBaseUrl = httpUrl(env.OLLAMA_BASE_URL ?? 'http://localhost:11434', 'OLLAMA_BASE_URL');
  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    if (origin === '*') {
      throw new ServiceUnavailableException('CORS_ALLOWED_ORIGINS must list explicit origins; wildcard origins are not allowed.');
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ServiceUnavailableException('Each CORS_ALLOWED_ORIGINS value must be an exact HTTP(S) origin.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new ServiceUnavailableException('Each CORS_ALLOWED_ORIGINS value must be an exact HTTP(S) origin.');
    }
  }

  return {
    port,
    authTokenSecret,
    databaseUrl,
    ollamaBaseUrl,
    allowedOrigins: [...new Set(allowedOrigins)],
    requestTimeoutMs,
    rateLimitWindowMs,
    rateLimitMax,
    bodyLimitBytes,
  };
};
