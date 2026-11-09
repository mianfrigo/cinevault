import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** Opens a session; the raw token goes to the cookie, only its hash is stored. */
  async create(userId: string): Promise<{ raw: string; expiresAt: Date }> {
    const { token, hash } = this.tokens.generateOpaque();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hash, expiresAt },
    });
    return { raw: token, expiresAt };
  }

  async revoke(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.tokens.hashOpaque(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
