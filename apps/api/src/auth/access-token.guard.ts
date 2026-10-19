import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthPrincipal } from './auth.types.js';

type AuthenticatedRequest = Request & { auth?: AuthPrincipal };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('A Bearer access token is required.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token || token.includes(' ')) {
      throw new UnauthorizedException('The access token is invalid.');
    }

    request.auth = await this.authService.authenticateToken(token);
    return true;
  }
}
