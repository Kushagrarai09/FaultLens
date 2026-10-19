import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthPrincipal } from './auth.types.js';
import { WorkspaceRoles } from './roles.decorator.js';
import { WorkspaceRolesGuard } from './workspace-roles.guard.js';

@Controller('api/workspaces')
@UseGuards(AccessTokenGuard, WorkspaceRolesGuard)
export class WorkspacesController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.authService.listWorkspaces(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    const name = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).name
      : undefined;
    return this.authService.createWorkspace(user.userId, name);
  }

  @Get('members')
  listMembers(@CurrentUser() user: AuthPrincipal) {
    return this.authService.listMembers(user.workspaceId);
  }

  @WorkspaceRoles('owner', 'admin')
  @Post('members')
  addMember(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    return this.authService.addMember(user.workspaceId, user.role, body);
  }
}
