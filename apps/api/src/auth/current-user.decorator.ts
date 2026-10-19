import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from './auth.types.js';

type AuthenticatedRequest = Request & { auth?: AuthPrincipal };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new Error('CurrentUser decorator requires AccessTokenGuard.');
    return request.auth;
  },
);
