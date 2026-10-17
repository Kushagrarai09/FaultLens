import { Controller, Get } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary() {
    return this.analyticsService.getSummary();
  }
}
