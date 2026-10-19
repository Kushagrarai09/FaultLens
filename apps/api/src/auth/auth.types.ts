export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthPrincipal {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: { id: string; email: string };
  workspace: { id: string; name: string; role: WorkspaceRole };
}
