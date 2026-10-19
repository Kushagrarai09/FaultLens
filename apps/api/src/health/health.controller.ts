import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'faultlens-api' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const databaseOk = await this.database.isHealthy();
    const ollamaOk = await this.checkOllama();
    const ready = databaseOk && ollamaOk;
    if (!ready) response.status(503);
    return {
      status: ready ? 'ready' : 'not_ready',
      checks: { database: databaseOk ? 'ok' : 'unavailable', ollama: ollamaOk ? 'ok' : 'unavailable' },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkOllama(): Promise<boolean> {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
    try {
      const result = await fetch(baseUrl + '/api/tags', { signal: AbortSignal.timeout(1_500) });
      return result.ok;
    } catch {
      return false;
    }
  }
}
