import { SetMetadata } from '@nestjs/common';
import type { WorkspaceRole } from './auth.types.js';

export const WORKSPACE_ROLES_KEY = 'faultlens:workspace-roles';
export const WorkspaceRoles = (...roles: WorkspaceRole[]) => SetMetadata(WORKSPACE_ROLES_KEY, roles);
