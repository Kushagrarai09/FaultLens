import { ServiceUnavailableException } from '@nestjs/common';

export interface RuntimeConfig {
  port: number;
  authTokenSecret: string;
  databaseUrl: string;
  ollamaBaseUrl: string;
  allowedOrigins: string[];
  requestTimeoutMs: number;
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authRateLimitWindowMs: number;
  authRateLimitMax: number;
  generationRateLimitWindowMs: number;
  generationRateLimitMax: number;
  pgPoolMax: number;
  pgConnectTimeoutMs: number;
  pgIdleTimeoutMs: number;
  pgQueryTimeoutMs: number;
  pgStatementTimeoutMs: number;
  pgHealthTimeoutMs: number;
  ollamaHealthTimeoutMs: number;
}

const integer = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number => {
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
  const requestTimeoutMs = integer(env.API_REQUEST_TIMEOUT_MS, 65_000, 1_000, 180_000, 'API_REQUEST_TIMEOUT_MS');
  const bodyLimitBytes = integer(env.API_BODY_LIMIT_BYTES, 262_144, 1_024, 10_485_760, 'API_BODY_LIMIT_BYTES');
  const rateLimitWindowMs = integer(env.API_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000, 'API_RATE_LIMIT_WINDOW_MS');
  const rateLimitMax = integer(env.API_RATE_LIMIT_MAX, 120, 1, 10_000, 'API_RATE_LIMIT_MAX');
  const authRateLimitWindowMs = integer(env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000, 'AUTH_RATE_LIMIT_WINDOW_MS');
  const authRateLimitMax = integer(env.AUTH_RATE_LIMIT_MAX, 10, 1, 100, 'AUTH_RATE_LIMIT_MAX');
  const generationRateLimitWindowMs = integer(env.GENERATION_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000, 'GENERATION_RATE_LIMIT_WINDOW_MS');
  const generationRateLimitMax = integer(env.GENERATION_RATE_LIMIT_MAX, 20, 1, 500, 'GENERATION_RATE_LIMIT_MAX');

  const databaseUrl = env.DATABASE_URL?.trim() ?? '';
  let parsedDb: URL | null = null;
  if (databaseUrl) {
    try {
      parsedDb = new URL(databaseUrl);
    } catch {
      throw new ServiceUnavailableException('Configuration DATABASE_URL must be a valid PostgreSQL URL.');
    }
    if (!['postgres:', 'postgresql:'].includes(parsedDb.protocol) || !parsedDb.hostname || !parsedDb.pathname.slice(1)) {
      throw new ServiceUnavailableException('Configuration DATABASE_URL must point to a PostgreSQL database.');
    }
  }

  const authTokenSecret = env.AUTH_TOKEN_SECRET ?? '';
  if (authTokenSecret.length < 32 || /^(change.?me|replace|example|test|secret)$/i.test(authTokenSecret.trim())) {
    throw new ServiceUnavailableException('Configuration AUTH_TOKEN_SECRET must be a unique random secret of at least 32 characters.');
  }
  if (!databaseUrl) {
    throw new ServiceUnavailableException('Configuration DATABASE_URL is required for API startup.');
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

  const pgPoolMax = integer(env.PG_POOL_MAX, 10, 1, 100, 'PG_POOL_MAX');
  const pgConnectTimeoutMs = integer(env.PG_CONNECT_TIMEOUT_MS, 2_000, 100, 30_000, 'PG_CONNECT_TIMEOUT_MS');
  const pgIdleTimeoutMs = integer(env.PG_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000, 'PG_IDLE_TIMEOUT_MS');
  const pgQueryTimeoutMs = integer(env.PG_QUERY_TIMEOUT_MS, 5_000, 100, 120_000, 'PG_QUERY_TIMEOUT_MS');
  const pgStatementTimeoutMs = integer(env.PG_STATEMENT_TIMEOUT_MS, 5_000, 100, 120_000, 'PG_STATEMENT_TIMEOUT_MS');
  const pgHealthTimeoutMs = integer(env.PG_HEALTH_TIMEOUT_MS, 1_000, 100, 10_000, 'PG_HEALTH_TIMEOUT_MS');
  const ollamaHealthTimeoutMs = integer(env.OLLAMA_HEALTH_TIMEOUT_MS, 2_000, 100, 30_000, 'OLLAMA_HEALTH_TIMEOUT_MS');

  return {
    port,
    authTokenSecret,
    databaseUrl,
    ollamaBaseUrl,
    allowedOrigins: [...new Set(allowedOrigins)],
    requestTimeoutMs,
    bodyLimitBytes,
    rateLimitWindowMs,
    rateLimitMax,
    authRateLimitWindowMs,
    authRateLimitMax,
    generationRateLimitWindowMs,
    generationRateLimitMax,
    pgPoolMax,
    pgConnectTimeoutMs,
    pgIdleTimeoutMs,
    pgQueryTimeoutMs,
    pgStatementTimeoutMs,
    pgHealthTimeoutMs,
    ollamaHealthTimeoutMs,
  };
};
