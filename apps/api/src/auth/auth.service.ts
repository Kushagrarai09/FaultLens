import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import type { AuthPrincipal, AuthSession, WorkspaceRole } from './auth.types.js';

const TOKEN_TTL_SECONDS = 60 * 60;
const PASSWORD_N = 16_384;
const PASSWORD_R = 8;
const PASSWORD_P = 1;
const PASSWORD_KEY_BYTES = 64;

type DbRow = Record<string, string | number | Date | boolean | null>;

interface TokenClaims {
  iss: 'faultlens';
  sub: string;
  workspaceId: string;
  iat: number;
  exp: number;
}

const scrypt = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      PASSWORD_KEY_BYTES,
      { N: PASSWORD_N, r: PASSWORD_R, p: PASSWORD_P, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => error ? reject(error) : resolve(derivedKey as Buffer),
    );
  });

const normalizeEmail = (value: unknown): string => {
  if (typeof value !== 'string') throw new ConflictException('A valid email address is required.');
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConflictException('A valid email address is required.');
  }
  return email;
};

const validateWorkspaceName = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ConflictException('workspaceName must be a non-empty string of at most 120 characters.');
  }
  return value.trim();
};

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(value: unknown): Promise<AuthSession> {
    this.tokenSecret();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException('Request body must be a JSON object.');
    }
    const body = value as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = body.password;
    if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
      throw new ConflictException('password must contain between 12 and 256 characters.');
    }
    const workspaceName = validateWorkspaceName(body.workspaceName);
    const passwordHash = await this.hashPassword(password);

    const result = await this.database.query<DbRow & {
      user_id: string; email: string; workspace_id: string; workspace_name: string; role: WorkspaceRole;
    }>(
      `WITH new_user AS (
         INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email
       ), new_workspace AS (
         INSERT INTO workspaces (name, owner_user_id)
         SELECT $3, id FROM new_user
         RETURNING id, name, owner_user_id
       ), new_member AS (
         INSERT INTO workspace_members (workspace_id, user_id, role)
         SELECT new_workspace.id, new_user.id, 'owner'
         FROM new_workspace CROSS JOIN new_user
         RETURNING workspace_id, user_id, role
       )
       SELECT new_user.id AS user_id, new_user.email,
              new_workspace.id AS workspace_id, new_workspace.name AS workspace_name,
              new_member.role
       FROM new_user CROSS JOIN new_workspace CROSS JOIN new_member`,
      [email, passwordHash, workspaceName],
    );

    const row = result.rows[0];
    return this.issueSession({
      userId: row.user_id,
      email: row.email,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      role: row.role,
    });
  }

  async login(value: unknown): Promise<AuthSession> {
    this.tokenSecret();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    const body = value as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    if (typeof body.password !== 'string' || body.password.length > 256) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const userResult = await this.database.query<DbRow & {
      id: string; email: string; password_hash: string;
    }>('SELECT id, email, password_hash FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    if (!user || !(await this.verifyPassword(body.password, user.password_hash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    let membershipResult;
    if (body.workspaceId !== undefined) {
      if (!isUuid(body.workspaceId)) throw new UnauthorizedException('Invalid email or password.');
      membershipResult = await this.database.query<DbRow & {
        workspace_id: string; workspace_name: string; role: WorkspaceRole;
      }>(
        `SELECT w.id AS workspace_id, w.name AS workspace_name, wm.role
         FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = $1 AND wm.workspace_id = $2`,
        [user.id, body.workspaceId],
      );
    } else {
      membershipResult = await this.database.query<DbRow & {
        workspace_id: string; workspace_name: string; role: WorkspaceRole;
      }>(
        `SELECT w.id AS workspace_id, w.name AS workspace_name, wm.role
         FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = $1 ORDER BY wm.created_at ASC LIMIT 1`,
        [user.id],
      );
    }

    const membership = membershipResult.rows[0];
    if (!membership) throw new UnauthorizedException('Invalid email or password.');
    return this.issueSession({
      userId: user.id,
      email: user.email,
      workspaceId: membership.workspace_id,
      workspaceName: membership.workspace_name,
      role: membership.role,
    });
  }

  async authenticateToken(token: string): Promise<AuthPrincipal> {
    const claims = this.verifyToken(token);
    const result = await this.database.query<DbRow & {
      user_id: string; email: string; workspace_id: string; workspace_name: string; role: WorkspaceRole;
    }>(
      `SELECT u.id AS user_id, u.email, w.id AS workspace_id, w.name AS workspace_name, wm.role
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE u.id = $1 AND w.id = $2`,
      [claims.sub, claims.workspaceId],
    );
    const member = result.rows[0];
    if (!member) throw new UnauthorizedException('The token no longer grants access to this workspace.');

    return {
      userId: member.user_id,
      email: member.email,
      workspaceId: member.workspace_id,
      workspaceName: member.workspace_name,
      role: member.role,
    };
  }

  async switchWorkspace(userId: string, workspaceIdValue: unknown): Promise<AuthSession> {
    if (!isUuid(workspaceIdValue)) throw new NotFoundException('Workspace was not found.');
    const result = await this.database.query<DbRow & {
      user_id: string; email: string; workspace_id: string; workspace_name: string; role: WorkspaceRole;
    }>(
      `SELECT u.id AS user_id, u.email, w.id AS workspace_id, w.name AS workspace_name, wm.role
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE u.id = $1 AND w.id = $2`,
      [userId, workspaceIdValue],
    );
    const membership = result.rows[0];
    if (!membership) throw new NotFoundException('Workspace was not found.');
    return this.issueSession({
      userId: membership.user_id,
      email: membership.email,
      workspaceId: membership.workspace_id,
      workspaceName: membership.workspace_name,
      role: membership.role,
    });
  }

  async listWorkspaces(userId: string) {
    const result = await this.database.query<DbRow & {
      id: string; name: string; role: WorkspaceRole; created_at: Date;
    }>(
      `SELECT w.id, w.name, wm.role, w.created_at
       FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1 ORDER BY wm.created_at ASC`,
      [userId],
    );
    return { data: result.rows };
  }

  async listMembers(workspaceId: string) {
    const result = await this.database.query<DbRow & {
      user_id: string; email: string; role: WorkspaceRole; joined_at: Date;
    }>(
      `SELECT u.id AS user_id, u.email, wm.role, wm.created_at AS joined_at
       FROM workspace_members wm JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 ORDER BY wm.created_at ASC`,
      [workspaceId],
    );
    return { data: result.rows };
  }

  async addMember(
    workspaceId: string,
    actorRole: WorkspaceRole,
    value: unknown,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException('Request body must be a JSON object.');
    }
    const body = value as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const role = body.role;
    if (role !== 'admin' && role !== 'member' && role !== 'viewer') {
      throw new ConflictException('role must be admin, member, or viewer.');
    }
    if (actorRole === 'admin' && role !== 'member' && role !== 'viewer') {
      throw new ForbiddenException('Workspace admins can add members or viewers, not admins.');
    }

    const userResult = await this.database.query<DbRow & { id: string }>(
      'SELECT id FROM users WHERE email = $1', [email],
    );
    const user = userResult.rows[0];
    if (!user) throw new NotFoundException('Register this user before adding them to a workspace.');

    await this.database.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [workspaceId, user.id, role],
    );
    return { userId: user.id, email, role };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt);
    return `scrypt$${PASSWORD_N}$${PASSWORD_R}$${PASSWORD_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  private async verifyPassword(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (n !== PASSWORD_N || r !== PASSWORD_R || p !== PASSWORD_P) return false;
    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(parts[4], 'base64url');
      expected = Buffer.from(parts[5], 'base64url');
    } catch {
      return false;
    }
    if (salt.length !== 16 || expected.length !== PASSWORD_KEY_BYTES) return false;
    const actual = await scrypt(password, salt);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private issueSession(principal: AuthPrincipal): AuthSession {
    const now = Math.floor(Date.now() / 1000);
    const claims: TokenClaims = {
      iss: 'faultlens',
      sub: principal.userId,
      workspaceId: principal.workspaceId,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = createHmac('sha256', this.tokenSecret()).update(unsigned).digest('base64url');
    return {
      accessToken: `${unsigned}.${signature}`,
      tokenType: 'Bearer',
      expiresInSeconds: TOKEN_TTL_SECONDS,
      user: { id: principal.userId, email: principal.email },
      workspace: { id: principal.workspaceId, name: principal.workspaceName, role: principal.role },
    };
  }

  private verifyToken(token: string): TokenClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('The access token is invalid or expired.');
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = createHmac('sha256', this.tokenSecret()).update(unsigned).digest();
    let supplied: Buffer;
    let claims: TokenClaims;
    try {
      supplied = Buffer.from(parts[2], 'base64url');
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as TokenClaims;
    } catch {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected) ||
      claims.iss !== 'faultlens' ||
      !isUuid(claims.sub) ||
      !isUuid(claims.workspaceId) ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }
    return claims;
  }

  private tokenSecret(): string {
    const secret = process.env.AUTH_TOKEN_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('Authentication is not configured. Set AUTH_TOKEN_SECRET to a random secret of at least 32 characters.');
    }
    return secret;
  }
}
