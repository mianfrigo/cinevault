import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const invalid = () =>
  new AppException(401, 'REFRESH_INVALID', 'Invalid or expired session');

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

  /**
   * Swaps a refresh token for a new one. A token that was already used or
   * revoked is replayed (stolen or raced): the user's whole family is revoked.
   */
  async rotate(
    raw: string,
  ): Promise<{ userId: string; raw: string; expiresAt: Date }> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.tokens.hashOpaque(raw) },
    });
    if (!row || row.expiresAt <= new Date()) throw invalid();
    if (row.revokedAt) {
      await this.revokeAll(row.userId);
      throw invalid();
    }

    const { token, hash } = this.tokens.generateOpaque();
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const won = await this.prisma.$transaction(async (tx) => {
      // Of concurrent calls with the same token exactly one gets count === 1.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count !== 1) return false;
      await tx.refreshToken.create({
        data: { userId: row.userId, tokenHash: hash, expiresAt },
      });
      return true;
    });
    if (!won) {
      await this.revokeAll(row.userId);
      throw invalid();
    }
    return { userId: row.userId, raw: token, expiresAt };
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
