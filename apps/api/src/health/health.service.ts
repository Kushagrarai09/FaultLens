import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { loadRuntimeConfig } from '../config/runtime-config.js';

type DependencyHealth = { status: 'ok' } | { status: 'error'; message: string };

@Injectable()
export class HealthService {
  private getConfig() {
    return loadRuntimeConfig();
  }

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
    let config: ReturnType<typeof loadRuntimeConfig>;
    try {
      config = this.getConfig();
    } catch {
      return { status: 'error', message: 'Ollama health configuration is invalid.' } as DependencyHealth;
    }
    const baseUrl = config.ollamaBaseUrl;
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(config.ollamaHealthTimeoutMs),
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
