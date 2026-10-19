import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestIdRequest } from './request-id.middleware.js';

@Catch()
@Injectable()
export class SanitizedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestIdRequest>();
    const response = http.getResponse<Response>();
    if (response.headersSent) return;

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeMessages: Record<number, { error: string; message: string }> = {
      400: { error: 'Bad Request', message: 'The request could not be processed.' },
      401: { error: 'Unauthorized', message: 'Authentication is required or invalid.' },
      403: { error: 'Forbidden', message: 'The request is not permitted.' },
      404: { error: 'Not Found', message: 'The requested resource was not found.' },
      408: { error: 'Request Timeout', message: 'The request exceeded its time limit.' },
      409: { error: 'Conflict', message: 'The resource conflicts with existing data.' },
      413: { error: 'Payload Too Large', message: 'Request body exceeds the configured limit.' },
      429: { error: 'Too Many Requests', message: 'Too many requests. Please wait before retrying.' },
      502: { error: 'Bad Gateway', message: 'An upstream dependency failed to process the request.' },
      503: { error: 'Service Unavailable', message: 'A required service is unavailable.' },
    };
    const body = safeMessages[status] ?? {
      error: status >= 500 ? 'Internal Server Error' : 'Request Failed',
      message: status >= 500 ? 'An unexpected error occurred.' : 'The request could not be processed.',
    };

    response.status(status).json({
      statusCode: status,
      error: body.error,
      message: body.message,
      requestId: request.requestId ?? null,
    });
  }
}
