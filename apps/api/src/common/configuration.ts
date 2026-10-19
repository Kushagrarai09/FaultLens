export interface ApiConfiguration {
  port: number;
  requestBodyLimit: string;
  requestTimeoutMs: number;
  corsOrigins: string[];
  ollamaBaseUrl: string;
}

const boundedInteger = (name: string, raw: string | undefined, fallback: number, min: number, max: number): number => {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
};

const parseUrl = (name: string, raw: string | undefined, allowedProtocols: string[], fallback?: string): string => {
  const value = raw ?? fallback;
  if (!value) throw new Error(`${name} is required.`);
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
};

export function loadApiConfiguration(env: NodeJS.ProcessEnv = process.env): ApiConfiguration {
  const secret = env.AUTH_TOKEN_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be set to a random secret of at least 32 characters.');
  }

  const port = boundedInteger('PORT', env.PORT, 3001, 1, 65535);
  const requestTimeoutMs = boundedInteger('HTTP_REQUEST_TIMEOUT_MS', env.HTTP_REQUEST_TIMEOUT_MS, 65_000, 1_000, 180_000);
  const requestBodyLimit = env.REQUEST_BODY_LIMIT?.trim() || '256kb';
  if (!/^[1-9]\d*(?:b|kb|mb)$/i.test(requestBodyLimit)) {
    throw new Error('REQUEST_BODY_LIMIT must be a positive byte size such as 64kb or 1mb.');
  }

  const configuredCors = (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of configuredCors) {
    if (origin === '*') throw new Error('CORS_ORIGINS must contain explicit origins, not a wildcard.');
    parseUrl('CORS_ORIGINS entry', origin, ['http:', 'https:']);
  }

  // Validate non-secret settings at startup so invalid limits fail before serving traffic.
  boundedInteger('API_RATE_LIMIT_MAX', env.API_RATE_LIMIT_MAX, 120, 1, 10_000);
  boundedInteger('API_RATE_LIMIT_WINDOW_MS', env.API_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000);
  boundedInteger('AUTH_RATE_LIMIT_MAX', env.AUTH_RATE_LIMIT_MAX, 10, 1, 100);
  boundedInteger('AUTH_RATE_LIMIT_WINDOW_MS', env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000);
  boundedInteger('GENERATION_RATE_LIMIT_MAX', env.GENERATION_RATE_LIMIT_MAX, 20, 1, 500);
  boundedInteger('GENERATION_RATE_LIMIT_WINDOW_MS', env.GENERATION_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000);
  boundedInteger('OLLAMA_HEALTH_TIMEOUT_MS', env.OLLAMA_HEALTH_TIMEOUT_MS, 2_000, 100, 30_000);
  boundedInteger('PG_POOL_MAX', env.PG_POOL_MAX, 10, 1, 100);
  boundedInteger('PG_CONNECT_TIMEOUT_MS', env.PG_CONNECT_TIMEOUT_MS, 2_000, 100, 30_000);
  boundedInteger('PG_IDLE_TIMEOUT_MS', env.PG_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000);
  boundedInteger('PG_QUERY_TIMEOUT_MS', env.PG_QUERY_TIMEOUT_MS, 5_000, 100, 120_000);
  boundedInteger('PG_STATEMENT_TIMEOUT_MS', env.PG_STATEMENT_TIMEOUT_MS, 5_000, 100, 120_000);
  boundedInteger('PG_HEALTH_TIMEOUT_MS', env.PG_HEALTH_TIMEOUT_MS, 1_000, 100, 10_000);

  if (env.DATABASE_URL) parseUrl('DATABASE_URL', env.DATABASE_URL, ['postgres:', 'postgresql:']);
  const ollamaBaseUrl = parseUrl('OLLAMA_BASE_URL', env.OLLAMA_BASE_URL, ['http:', 'https:'], 'http://localhost:11434');
  return { port, requestBodyLimit, requestTimeoutMs, corsOrigins: configuredCors, ollamaBaseUrl };
}
