import { Injectable, TooManyRequestsException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

interface WindowEntry {
  start: number;
  count: number;
}

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowEntry>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = request.path;

    // Keep probes available to the orchestrator even if an API client is over quota.
    if (path === '/health' || path === '/health/live' || path === '/health/ready') return true;

    const windowMs = this.readBoundedInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000);
    const maxRequests = this.readBoundedInt(process.env.API_RATE_LIMIT_MAX, 100, 1, 10_000);
    const now = Date.now();
    const key = this.clientKey(request);
    let entry = this.windows.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      this.windows.set(key, entry);
    }

    // Opportunistically discard expired entries; no unbounded per-IP history is retained.
    if (this.windows.size > 5_000) {
      for (const [storedKey, stored] of this.windows) {
        if (now - stored.start >= windowMs) this.windows.delete(storedKey);
      }
    }

    response.setHeader('RateLimit-Limit', String(maxRequests));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil((entry.start + windowMs) / 1000)));

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new TooManyRequestsException('Rate limit exceeded. Try again later.');
    }
    response.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    return true;
  }

  clearForTests(): void {
    this.windows.clear();
  }

  private clientKey(request: Request): string {
    // Do not trust X-Forwarded-For here; configure Express proxy trust explicitly
    // only when running behind a known reverse proxy.
    return request.socket.remoteAddress ?? 'unknown';
  }

  private readBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
    if (!value || !/^\d+$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  }
}
