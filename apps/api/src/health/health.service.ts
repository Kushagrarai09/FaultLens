import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { loadApiConfiguration } from '../common/configuration.js';

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
    const baseUrl = loadApiConfiguration().ollamaBaseUrl;
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeoutMs()),
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

  private timeoutMs() {
    const raw = process.env.OLLAMA_HEALTH_TIMEOUT_MS;
    if (raw === undefined) return 2_000;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 100 || value > 30_000) {
      throw new Error('OLLAMA_HEALTH_TIMEOUT_MS must be an integer between 100 and 30000.');
    }
    return value;
  }
}
