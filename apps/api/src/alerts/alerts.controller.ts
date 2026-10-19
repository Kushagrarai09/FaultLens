import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { WorkspaceRoles } from '../auth/roles.decorator.js';
import { WorkspaceRolesGuard } from '../auth/workspace-roles.guard.js';
import { AlertsService } from './alerts.service.js';
import type { AlertRuleDto } from './alerts.service.js';

@Controller('api/alerts')
@UseGuards(AccessTokenGuard, WorkspaceRolesGuard, RateLimitGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('rules')
  listRules(@CurrentUser() user: AuthPrincipal): ReturnType<AlertsService['listRules']> {
    return this.alertsService.listRules(user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('rules')
  createRule(@CurrentUser() user: AuthPrincipal, @Body() body: unknown): Promise<AlertRuleDto> {
    return this.alertsService.createRule(body, user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Patch('rules/:id')
  updateRule(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() body: unknown): Promise<AlertRuleDto> {
    return this.alertsService.updateRule(id, body, user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('evaluate')
  evaluate(@CurrentUser() user: AuthPrincipal): ReturnType<AlertsService['evaluate']> {
    return this.alertsService.evaluate(user.workspaceId);
  }
}
