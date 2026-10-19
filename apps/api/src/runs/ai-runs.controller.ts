import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { WorkspaceRoles } from '../auth/roles.decorator.js';
import { WorkspaceRolesGuard } from '../auth/workspace-roles.guard.js';
import { AiRunsService } from './ai-runs.service.js';
import { parseCreateAiRunInput } from './ai-run.validation.js';

@Controller('api/runs')
@UseGuards(RateLimitGuard)
@UseGuards(AccessTokenGuard, WorkspaceRolesGuard)
export class AiRunsController {
  constructor(private readonly aiRunsService: AiRunsService) {}

  @WorkspaceRoles('owner', 'admin', 'member')
  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.aiRunsService.create(parseCreateAiRunInput(body), user.workspaceId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
  ) {
    const limit = this.parseIntegerQuery(limitValue, 'limit', 20, 1, 100);
    const offset = this.parseIntegerQuery(offsetValue, 'offset', 0, 0, 1_000_000);
    return this.aiRunsService.list(user.workspaceId, limit, offset);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.aiRunsService.findById(id, user.workspaceId);
  }

  private parseIntegerQuery(
    value: string | undefined,
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`${name} must be a whole number.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${name} must be between ${min} and ${max}.`);
    }
    return parsed;
  }
}
