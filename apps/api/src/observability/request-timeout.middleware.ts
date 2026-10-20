import type { NextFunction, Request, Response } from 'express';

export function requestTimeoutMiddleware(timeoutMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (response.headersSent || response.writableEnded) return;
      response.status(408).json({
        statusCode: 408,
        message: 'The request timed out.',
        requestId: response.getHeader('X-Request-Id') ?? null,
      });
    }, timeoutMs);

    timer.unref?.();
    response.on('finish', () => clearTimeout(timer));
    response.on('close', () => clearTimeout(timer));
    next();
  };
}
