import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { BlockListService } from './blocklist.service';
import type { AuthedRequest } from './decorators';
import { TokensService } from './tokens.service';

/** `Bearer <token>`: scheme is case-insensitive, exactly one token. */
const BEARER = /^bearer\s+(\S+)$/i;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokensService,
    private readonly blocklist: BlockListService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = BEARER.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new AppException(401, 'UNAUTHORIZED', 'Missing or malformed token');
    }
    const { sub, role } = await this.tokens.verifyAccess(token);
    if (await this.blocklist.isBlocked(sub)) {
      throw new AppException(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
    }
    req.user = { id: sub, role };
    return true;
  }
}
