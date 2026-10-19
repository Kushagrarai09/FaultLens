import type { NextFunction, Request, Response } from 'express';

export function requestBodyErrorMiddleware(
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!error) {
    next();
    return;
  }

  const type = (error as { type?: string } | null)?.type;
  const requestId = response.getHeader('X-Request-Id') ?? null;
  if (type === 'entity.too.large') {
    response.status(413).json({
      statusCode: 413,
      message: 'Request body exceeds the configured size limit.',
      requestId,
    });
    return;
  }

  if (type === 'entity.parse.failed') {
    response.status(400).json({
      statusCode: 400,
      message: 'Request body must contain valid JSON.',
      requestId,
    });
    return;
  }

  response.status(400).json({
    statusCode: 400,
    message: 'Request is invalid.',
    requestId,
  });
}
