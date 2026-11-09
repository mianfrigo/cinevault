import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/app.exception';
import type { Role } from '../generated/prisma/client';
import { ROLES_KEY, type AuthedRequest } from './decorators';

/** Use after JwtAuthGuard. No @Roles means any authenticated role is allowed. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!roles?.length) return true;
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    // No user (guard order mistake) fails closed.
    if (!user || !roles.includes(user.role)) {
      throw new AppException(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    return true;
  }
}
