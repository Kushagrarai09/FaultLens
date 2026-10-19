import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthPrincipal } from './auth.types.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('login')
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return {
      user: { id: user.userId, email: user.email },
      workspace: { id: user.workspaceId, name: user.workspaceName, role: user.role },
    };
  }

  @UseGuards(AccessTokenGuard)
  @Post('switch-workspace')
  switchWorkspace(@CurrentUser() user: AuthPrincipal, @Body() body: unknown) {
    const workspaceId = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).workspaceId
      : undefined;
    return this.authService.switchWorkspace(user.userId, workspaceId);
  }
}
