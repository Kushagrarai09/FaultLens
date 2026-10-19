import { Injectable, TooManyRequestsException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

interface WindowEntry {
  start: number;
  count: number;
}
interface RateBucket {
  name: string;
  max: number;
  windowMs: number;
}

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowEntry>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = request.path;

    // Keep liveness/readiness probes reachable even when an API client is over quota.
    if (path === '/health' || path === '/health/live' || path === '/health/ready') return true;

    const bucket = this.bucketFor(request.method.toUpperCase(), path);
    const now = Date.now();
    const key = `${bucket.name}:${this.clientKey(request)}`;
    let entry = this.windows.get(key);
    if (!entry || now - entry.start >= bucket.windowMs) {
      entry = { start: now, count: 0 };
      this.windows.set(key, entry);
    }

    // Opportunistically discard expired entries; no unbounded per-IP history is retained.
    if (this.windows.size > 5_000) {
      for (const [storedKey, stored] of this.windows) {
        if (now - stored.start >= bucket.windowMs) this.windows.delete(storedKey);
      }
    }

    response.setHeader('RateLimit-Limit', String(bucket.max));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, bucket.max - entry.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil((entry.start + bucket.windowMs) / 1000)));

    entry.count += 1;
    if (entry.count > bucket.max) {
      const retryAfter = Math.max(1, Math.ceil((entry.start + bucket.windowMs - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      throw new TooManyRequestsException('Rate limit exceeded. Try again later.');
    }

    response.setHeader('RateLimit-Remaining', String(Math.max(0, bucket.max - entry.count)));
    return true;
  }

  clearForTests(): void {
    this.windows.clear();
  }

  private bucketFor(method: string, path: string): RateBucket {
    if (method === 'POST' && (path === '/api/auth/login' || path === '/api/auth/register')) {
      return {
        name: 'auth',
        max: this.readBoundedInt(process.env.AUTH_RATE_LIMIT_MAX, 10, 1, 100),
        windowMs: this.readBoundedInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
      };
    }
    if (method === 'POST' && path === '/api/ai/generate') {
      return {
        name: 'generation',
        max: this.readBoundedInt(process.env.GENERATION_RATE_LIMIT_MAX, 20, 1, 500),
        windowMs: this.readBoundedInt(process.env.GENERATION_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
      };
    }
    return {
      name: 'default',
      max: this.readBoundedInt(process.env.API_RATE_LIMIT_MAX, 120, 1, 10_000),
      windowMs: this.readBoundedInt(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
    };
  }

  private clientKey(request: Request): string {
    // Do not trust X-Forwarded-For; configure trusted proxy handling explicitly
    // only when running behind a known reverse proxy.
    return request.socket.remoteAddress ?? 'unknown';
  }

  private readBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
    if (!value || !/^\d+$/.test(value)) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  }
}
