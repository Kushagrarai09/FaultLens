import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const SAFE_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Request is invalid.',
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required or invalid.',
  [HttpStatus.FORBIDDEN]: 'Access is not permitted.',
  [HttpStatus.NOT_FOUND]: 'Resource was not found.',
  [HttpStatus.CONFLICT]: 'The request conflicts with an existing resource.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Request body exceeds the configured size limit.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit exceeded. Try again later.',
  [HttpStatus.REQUEST_TIMEOUT]: 'The request timed out.',
  [HttpStatus.BAD_GATEWAY]: 'An upstream provider request failed.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable.',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : exception && typeof exception === 'object' && 'type' in exception && exception.type === 'entity.too.large'
        ? HttpStatus.PAYLOAD_TOO_LARGE
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId = response.getHeader('X-Request-Id') ?? null;
    const publicMessage = status >= 500 || status === HttpStatus.TOO_MANY_REQUESTS || status === HttpStatus.PAYLOAD_TOO_LARGE
      ? SAFE_MESSAGES[status] ?? 'An unexpected server error occurred.'
      : SAFE_MESSAGES[status] ?? 'Request was rejected.';

    // Intentionally omit the exception message, stack, headers, body, and SQL details.
    if (status >= 500) {
      process.stderr.write(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'http_exception',
        requestId,
        method: request.method,
        path: request.path,
        statusCode: status,
      }) + '\n');
    }

    if (response.headersSent) {
      response.end();
      return;
    }

    response.status(status).json({
      statusCode: status,
      message: publicMessage,
      requestId,
    });
  }
}
