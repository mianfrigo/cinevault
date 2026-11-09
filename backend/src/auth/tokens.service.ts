import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { ENV, type Env } from '../config/env';
import type { Role } from '../generated/prisma/client';

export const ACCESS_TTL_SECONDS = 10 * 60;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  signAccess(user: { id: string; role: Role }): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role },
      {
        secret: this.env.jwtAccessSecret,
        algorithm: 'HS256',
        expiresIn: ACCESS_TTL_SECONDS,
      },
    );
  }

  /** Pins HS256, so alg=none and other algorithms are refused. */
  async verifyAccess(token: string): Promise<{ sub: string; role: Role }> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; role: Role }>(token, {
        secret: this.env.jwtAccessSecret,
        algorithms: ['HS256'],
      });
      return { sub: p.sub, role: p.role };
    } catch {
      throw new AppException(
        401,
        'UNAUTHORIZED',
        'Invalid or expired access token',
      );
    }
  }

  /** 32 random bytes, base64url; only the sha256 hex hash is ever stored. */
  generateOpaque(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOpaque(token) };
  }

  hashOpaque(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
