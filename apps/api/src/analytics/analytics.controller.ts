import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('api/analytics')
@UseGuards(RateLimitGuard)
@UseGuards(AccessTokenGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthPrincipal) {
    return this.analyticsService.getSummary(user.workspaceId);
  }
}
