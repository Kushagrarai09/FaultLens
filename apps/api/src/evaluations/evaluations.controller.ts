import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { WorkspaceRoles } from '../auth/roles.decorator.js';
import { WorkspaceRolesGuard } from '../auth/workspace-roles.guard.js';
import { EvaluationsService } from './evaluations.service.js';

@Controller('api')
@UseGuards(RateLimitGuard)
@UseGuards(AccessTokenGuard, WorkspaceRolesGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get('prompts')
  listPrompts(@CurrentUser() user: AuthPrincipal) {
    return this.evaluationsService.listPrompts(user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('prompts')
  createPrompt(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.evaluationsService.createPrompt(body, user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('prompts/:id/versions')
  createVersion(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.evaluationsService.createVersion(id, body, user.workspaceId);
  }

  @Get('datasets')
  listDatasets(@CurrentUser() user: AuthPrincipal) {
    return this.evaluationsService.listDatasets(user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('datasets')
  createDataset(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.evaluationsService.createDataset(body, user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('evaluations')
  runComparison(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.evaluationsService.runComparison(body, user.workspaceId);
  }

  @Get('evaluations/:id')
  getEvaluation(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.evaluationsService.getEvaluation(id, user.workspaceId);
  }
}
