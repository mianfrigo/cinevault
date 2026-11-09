import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
}

/** Set by JwtAuthGuard. */
export type AuthedRequest = Request & { user?: AuthUser };

export const ROLES_KEY = 'roles';
/** Restricts a route (or controller) to these roles; enforced by RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated user; only valid behind JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user as AuthUser,
);
