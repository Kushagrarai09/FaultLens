import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { WorkspaceRoles } from '../auth/roles.decorator.js';
import { WorkspaceRolesGuard } from '../auth/workspace-roles.guard.js';
import { AiGenerationService } from './ai-generation.service.js';
import { parseGenerateAiInput } from './ai-generation.types.js';

@Controller('api/ai')
@UseGuards(RateLimitGuard)
@UseGuards(AccessTokenGuard, WorkspaceRolesGuard)
export class AiGenerationController {
  constructor(private readonly aiGenerationService: AiGenerationService) {}

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post('generate')
  generate(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.aiGenerationService.generate(parseGenerateAiInput(body), user.workspaceId);
  }
}
