import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspaceRolesGuard } from './workspace-roles.guard.js';
import { ApiRateLimitGuard } from '../security/api-rate-limit.guard.js';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, WorkspacesController],
  providers: [AuthService, AccessTokenGuard, WorkspaceRolesGuard],
  exports: [AuthService, AccessTokenGuard, WorkspaceRolesGuard, ApiRateLimitGuard],
})
export class AuthModule {}
