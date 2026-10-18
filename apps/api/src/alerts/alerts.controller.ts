import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import type { AlertRuleDto } from './alerts.service.js';

@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('rules')
  listRules(): ReturnType<AlertsService['listRules']> { return this.alertsService.listRules(); }

  @Post('rules')
  createRule(@Body() body: unknown): Promise<AlertRuleDto> { return this.alertsService.createRule(body); }

  @Patch('rules/:id')
  updateRule(@Param('id') id: string, @Body() body: unknown): Promise<AlertRuleDto> {
    return this.alertsService.updateRule(id, body);
  }

  @Post('evaluate')
  evaluate(): ReturnType<AlertsService['evaluate']> { return this.alertsService.evaluate(); }
}
