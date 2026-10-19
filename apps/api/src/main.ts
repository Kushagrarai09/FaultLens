import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { StructuredLogger } from './common/structured-logger.js';
import { requestIdMiddleware } from './common/request-id.middleware.js';
import { SanitizedExceptionFilter } from './common/sanitized-exception.filter.js';
import { loadApiConfiguration } from './common/configuration.js';

async function bootstrap() {
  const configuration = loadApiConfiguration();
  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger({ timestamp: false }),
    bodyParser: false,
  });
  const express = app.getHttpAdapter().getInstance();
  const expressModule = await import('express');
  express.use(expressModule.json({ limit: configuration.requestBodyLimit, strict: true }));
  express.use(expressModule.urlencoded({ extended: false, limit: configuration.requestBodyLimit, parameterLimit: 100 }));



  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Handle errors raised by body parsers before Nest routes are entered.
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (!error) return next();
    const maybe = error as { type?: string };
    const requestId = (request as Request & { requestId?: string }).requestId ?? null;
    if (maybe.type === 'entity.too.large') {
      return response.status(413).json({
        statusCode: 413, error: 'Payload Too Large',
        message: 'Request body exceeds the configured limit.', requestId,
      });
    }
    if (maybe.type === 'entity.parse.failed') {
      return response.status(400).json({
        statusCode: 400, error: 'Bad Request',
        message: 'Request body must contain valid JSON.', requestId,
      });
    }
    // Unexpected parser/middleware details are intentionally never reflected.
    return response.status(400).json({
      statusCode: 400, error: 'Bad Request',
      message: 'The request could not be processed.', requestId,
    });
  });

  app.use(requestIdMiddleware);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = (request as Request & { requestId?: string }).requestId ?? 'unknown';
    const started = Date.now();
    response.on('finish', () => {
      // Never log request body, URL query strings, authorization headers or exception details.
      app.get(StructuredLogger).log({
        event: 'http_request',
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - started,
        remoteAddress: request.ip,
      }, 'HTTP');
    });
    next();
  });

  const configuredOrigins = configuration.corsOrigins;
  app.enableCors({
    origin: configuredOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalFilters(new SanitizedExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
  }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setTimeout(Number(configuration.requestTimeoutMs), () => {
      if (!response.headersSent) {
        response.status(408).json({
          statusCode: 408,
          error: 'Request Timeout',
          message: 'The request exceeded the configured time limit.',
          requestId: (request as Request & { requestId?: string }).requestId ?? null,
        });
      }
      response.destroy();
    });
    next();
  });



  app.enableShutdownHooks();
  const server = app.getHttpServer() as import('node:http').Server;
  server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS ?? 65_000);
  server.headersTimeout = Math.min(server.requestTimeout + 5_000, 190_000);
  server.keepAliveTimeout = 5_000;

  await app.listen(configuration.port);
}
await bootstrap();
