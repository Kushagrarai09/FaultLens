import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { StructuredLogger } from './observability/structured-logger.js';
import { HttpExceptionFilter } from './observability/http-exception.filter.js';
import { requestLoggingMiddleware } from './observability/request-logging.middleware.js';
import { requestTimeoutMiddleware } from './observability/request-timeout.middleware.js';
import { ApiRateLimitGuard } from './security/api-rate-limit.guard.js';
import { loadRuntimeConfig } from './config/runtime-config.js';

async function bootstrap() {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create(AppModule, {
    logger: new StructuredLogger(),
    bodyParser: false,
  });
  const express = app.getHttpAdapter().getInstance();
  const expressModule = await import('express');

  // Assign a request ID before body parsing so even parser failures can be correlated.
  app.use(requestLoggingMiddleware);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  express.use(expressModule.json({ limit: config.bodyLimitBytes, strict: true }));
  express.use(expressModule.urlencoded({ extended: false, limit: config.bodyLimitBytes, parameterLimit: 100 }));

  // Sanitize malformed/oversized body errors raised before Nest's route pipeline.
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (!error) return next();
    const type = (error as { type?: string }).type;
    const requestId = response.getHeader('X-Request-Id') ?? null;
    if (type === 'entity.too.large') {
      return response.status(413).json({
        statusCode: 413,
        message: 'Request body exceeds the configured size limit.',
        requestId,
      });
    }
    if (type === 'entity.parse.failed') {
      return response.status(400).json({
        statusCode: 400,
        message: 'Request body must contain valid JSON.',
        requestId,
      });
    }
    return response.status(400).json({
      statusCode: 400,
      message: 'Request is invalid.',
      requestId,
    });
  });

  app.enableCors({
    origin: config.allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    credentials: false,
    maxAge: 600,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: true,
  }));
  app.use(requestTimeoutMiddleware(config.requestTimeoutMs));
  app.useGlobalGuards(app.get(ApiRateLimitGuard));

  app.enableShutdownHooks();
  const server = app.getHttpServer() as import('node:http').Server;
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.min(server.requestTimeout + 5_000, 190_000);
  server.keepAliveTimeout = 5_000;

  await app.listen(config.port);
}
await bootstrap();
