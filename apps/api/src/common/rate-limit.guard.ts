import {
  CanActivate,
  ExecutionContext,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface WindowCounter {
  count: number;
  resetAt: number;
}

interface RateLimitRequest extends Request {
  rateLimitKey?: string;
}

/**
 * Small in-process fixed-window limiter for a single API instance.
 * For horizontally scaled production deployments, replace with a shared
 * Redis-backed limiter. Never use caller-controlled X-Forwarded-For values
 * unless trusted proxy handling is configured at the edge.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, WindowCounter>();
  private lastCleanup = 0;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    this.cleanup(now);

    const method = request.method.toUpperCase();
    const route = request.route?.path ?? request.path;
    const bucket = this.bucketFor(method, route);
    if (!bucket) return true;

    const key = `${bucket.name}:${this.clientKey(request)}`;
    const current = this.windows.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + bucket.windowMs }
      : current;

    counter.count += 1;
    this.windows.set(key, counter);
    const remaining = Math.max(0, bucket.max - counter.count);
    response.setHeader('X-RateLimit-Limit', String(bucket.max));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));

    if (counter.count > bucket.max) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((counter.resetAt - now) / 1000))));
      throw new TooManyRequestsException('Too many requests. Please wait before retrying.');
    }
    return true;
  }

  private bucketFor(method: string, route: string) {
    if (method === 'POST' && (route === '/api/auth/login' || route === '/api/auth/register')) {
      return { name: 'auth', max: this.intEnv('AUTH_RATE_LIMIT_MAX', 10, 1, 100), windowMs: this.intEnv('AUTH_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000) };
    }
    if (method === 'POST' && route === '/api/ai/generate') {
      return { name: 'generation', max: this.intEnv('GENERATION_RATE_LIMIT_MAX', 20, 1, 500), windowMs: this.intEnv('GENERATION_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000) };
    }
    return { name: 'default', max: this.intEnv('API_RATE_LIMIT_MAX', 120, 1, 10_000), windowMs: this.intEnv('API_RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000) };
  }

  private clientKey(request: Request): string {
    const authenticated = (request as Request & { auth?: { userId?: string; workspaceId?: string } }).auth;
    if (authenticated?.userId && authenticated.workspaceId) {
      return `user:${authenticated.userId}:workspace:${authenticated.workspaceId}`;
    }
    return `ip:${request.ip || request.socket.remoteAddress || 'unknown'}`;
  }

  private intEnv(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }
    return value;
  }

  private cleanup(now: number) {
    if (now - this.lastCleanup < 30_000) return;
    for (const [key, counter] of this.windows) {
      if (counter.resetAt <= now) this.windows.delete(key);
    }
    this.lastCleanup = now;
  }
}
