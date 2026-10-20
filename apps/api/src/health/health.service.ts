import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';

type DependencyHealth = { status: 'ok' } | { status: 'error'; message: string };

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async checkDatabase(): Promise<DependencyHealth> {
    try {
      await this.database.healthCheck();
      return { status: 'ok' };
    } catch {
      return { status: 'error', message: 'PostgreSQL is unavailable.' };
    }
  }

  async checkOllama(): Promise<DependencyHealth> {
    let baseUrl = 'http://localhost:11434';
    let timeoutMs = 2_000;
    try {
      const config = loadRuntimeConfig();
      baseUrl = config.ollamaBaseUrl;
      timeoutMs = config.ollamaHealthTimeoutMs;
    } catch {
      // Ollama settings can still be checked even when the database is unconfigured.
      const configuredUrl = process.env.OLLAMA_BASE_URL;
      if (configuredUrl) {
        try {
          const parsed = new URL(configuredUrl);
          if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
            return { status: 'error', message: 'Ollama health configuration is invalid.' };
          }
          baseUrl = parsed.toString().replace(/\/$/, '');
        } catch {
          return { status: 'error', message: 'Ollama health configuration is invalid.' };
        }
      }
      const timeout = process.env.OLLAMA_HEALTH_TIMEOUT_MS;
      if (timeout !== undefined) {
        const parsedTimeout = Number(timeout);
        if (!Number.isSafeInteger(parsedTimeout) || parsedTimeout < 100 || parsedTimeout > 30_000) {
          return { status: 'error', message: 'Ollama health configuration is invalid.' };
        }
        timeoutMs = parsedTimeout;
      }
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return { status: 'error', message: 'Ollama returned an unsuccessful health response.' };
      return { status: 'ok' };
    } catch {
      return { status: 'error', message: 'Ollama is unavailable or timed out.' };
    }
  }

  async readiness() {
    const [postgres, ollama] = await Promise.all([this.checkDatabase(), this.checkOllama()]);
    const ready = postgres.status === 'ok' && ollama.status === 'ok';
    return {
      status: ready ? 'ok' as const : 'error' as const,
      ready,
      dependencies: { postgres, ollama },
      timestamp: new Date().toISOString(),
    };
  }
}
