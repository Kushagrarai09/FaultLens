import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { WORKSPACE_ROLES_KEY } from './roles.decorator.js';
import type { AuthPrincipal, WorkspaceRole } from './auth.types.js';

type AuthenticatedRequest = Request & { auth?: AuthPrincipal };

@Injectable()
export class WorkspaceRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<WorkspaceRole[]>(
      WORKSPACE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth || !allowed.includes(request.auth.role)) {
      throw new ForbiddenException('Your workspace role does not permit this action.');
    }
    return true;
  }
}
