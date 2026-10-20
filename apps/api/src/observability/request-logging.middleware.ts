import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestLoggingMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startedAt = Date.now();
  response.setHeader('X-Request-Id', requestId);

  response.on('finish', () => {
    const status = response.statusCode;
    const entry = {
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      event: 'http_request',
      requestId,
      method: request.method,
      path: request.path,
      statusCode: status,
      durationMs: Date.now() - startedAt,
    };
    const line = JSON.stringify(entry) + '\n';
    if (status >= 500) process.stderr.write(line);
    else process.stdout.write(line);
  });
  next();
}
