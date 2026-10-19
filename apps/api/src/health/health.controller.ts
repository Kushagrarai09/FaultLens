import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live() {
    return { status: 'ok', live: true, service: 'faultlens-api', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready(@Res() response: Response) {
    const health = await this.health.readiness();
    return response.status(health.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(health);
  }
}
