import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import type { EmailToken, EmailTokenType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';

const HOUR_MS = 60 * 60 * 1000;
export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * HOUR_MS,
  RESET_PASSWORD: HOUR_MS,
  CHANGE_EMAIL: 24 * HOUR_MS,
};

const invalid = () =>
  new AppException(400, 'TOKEN_INVALID', 'Token is invalid or already used');

@Injectable()
export class EmailTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** Returns the raw token; earlier unused tokens of this user and type stop working. */
  async issue(
    userId: string,
    type: EmailTokenType,
    opts?: { newEmail?: string },
  ): Promise<string> {
    const { token, hash } = this.tokens.generateOpaque();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.emailToken.create({
        data: {
          userId,
          type,
          tokenHash: hash,
          newEmail: opts?.newEmail ?? null,
          expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[type]),
        },
      }),
    ]);
    return token;
  }

  /** Single use: of any number of concurrent calls with the same token, one wins. */
  async consume(raw: string, types: EmailTokenType[]): Promise<EmailToken> {
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: this.tokens.hashOpaque(raw) },
    });
    if (!row || row.usedAt || !types.includes(row.type)) throw invalid();
    const now = new Date();
    if (row.expiresAt <= now) {
      throw new AppException(400, 'TOKEN_EXPIRED', 'Token has expired');
    }
    const { count } = await this.prisma.emailToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count !== 1) throw invalid();
    return row;
  }
}
