import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { runInBackground } from '../common/background';
import { Prisma } from '../generated/prisma/client';
import type { User } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, type UserDto } from '../users/user.dto';
import type { EmailDto, LoginDto, RegisterDto } from './auth.dto';
import { EmailTokensService } from './email-tokens.service';
import { normalizeEmail } from './email';
import { PasswordService } from './password.service';
import { SessionsService } from './sessions.service';
import { TokensService } from './tokens.service';

/** Same answer on every register / resend path: it must not reveal account state. */
export const ACCEPTED = {
  message: 'If the address can be used, we sent an email.',
};

const isPrismaError = (e: unknown, code: string) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly emailTokens: EmailTokensService,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
  ) {}

  private sendVerification(user: Pick<User, 'id' | 'email' | 'name'>): void {
    runInBackground(this.logger, 'verification mail', async () => {
      const token = await this.emailTokens.issue(user.id, 'VERIFY_EMAIL');
      await this.mail.sendVerifyEmail(user.email, user.name, token);
    });
  }

  async register(dto: RegisterDto): Promise<typeof ACCEPTED> {
    const email = normalizeEmail(dto.email);
    // Hashed on every path (the hash is discarded for existing accounts), so the
    // response time does not tell a new address from a registered one.
    const passwordHash = await this.passwords.hash(dto.password);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (!existing) {
      try {
        const user = await this.prisma.user.create({
          data: { email, name: dto.name, passwordHash },
        });
        this.sendVerification(user);
      } catch (e) {
        // A concurrent registration won the race: it sends the mail, we do nothing.
        if (!isPrismaError(e, 'P2002')) throw e;
      }
    } else if (existing.status === 'PENDING') {
      // The latest submission replaces name and password: an attacker who
      // pre-registered a victim's address must not keep the password (takeover defence).
      // Guarded by status so an account verified or blocked meanwhile is never overwritten.
      const { count } = await this.prisma.user.updateMany({
        where: { id: existing.id, status: 'PENDING' },
        data: { name: dto.name, passwordHash },
      });
      if (count === 1) this.sendVerification({ ...existing, name: dto.name });
    } else {
      runInBackground(this.logger, 'already-registered mail', () =>
        this.mail.sendAlreadyRegistered(existing.email, existing.name),
      );
    }
    return ACCEPTED;
  }

  async resendVerification(dto: EmailDto): Promise<typeof ACCEPTED> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    if (user?.status === 'PENDING') this.sendVerification(user);
    return ACCEPTED;
  }

  /** VERIFY_EMAIL activates the account; CHANGE_EMAIL swaps the address. */
  async verifyEmail(raw: string): Promise<void> {
    const t = await this.emailTokens.consume(raw, [
      'VERIFY_EMAIL',
      'CHANGE_EMAIL',
    ]);
    if (t.type === 'VERIFY_EMAIL') {
      // A BLOCKED user stays blocked: the token is spent, the status untouched.
      await this.prisma.user.updateMany({
        where: { id: t.userId, status: 'PENDING' },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      return;
    }
    if (!t.newEmail) {
      throw new AppException(400, 'TOKEN_INVALID', 'Token is invalid');
    }
    try {
      // Only an ACTIVE user may change email; for anyone else the token is spent and refused.
      const { count } = await this.prisma.user.updateMany({
        where: { id: t.userId, status: 'ACTIVE' },
        data: { email: normalizeEmail(t.newEmail) },
      });
      if (count !== 1) {
        throw new AppException(400, 'TOKEN_INVALID', 'Token is invalid');
      }
    } catch (e) {
      // Address taken meanwhile.
      if (isPrismaError(e, 'P2002')) {
        throw new AppException(400, 'TOKEN_INVALID', 'Token is invalid');
      }
      throw e;
    }
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    user: UserDto;
    session: { raw: string; expiresAt: Date };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    let ok = false;
    if (user) {
      ok = await this.passwords.verify(user.passwordHash, dto.password);
    } else {
      await this.passwords.verifyDummy(dto.password);
    }
    if (!user || !ok) {
      throw new AppException(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }
    // Status is checked only after the password, so a wrong password never reveals it.
    if (user.status === 'PENDING') {
      throw new AppException(
        403,
        'EMAIL_NOT_VERIFIED',
        'Verify your email before logging in',
      );
    }
    if (user.status === 'BLOCKED') {
      throw new AppException(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
    }
    return {
      accessToken: await this.tokens.signAccess(user),
      user: toUserDto(user),
      session: await this.sessions.create(user.id),
    };
  }
  /** Only an ACTIVE account gets a reset mail; every other case answers the same. */
  async forgotPassword(dto: EmailDto): Promise<typeof ACCEPTED> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
    });
    if (user?.status === 'ACTIVE') {
      runInBackground(this.logger, 'reset mail', async () => {
        const token = await this.emailTokens.issue(user.id, 'RESET_PASSWORD');
        await this.mail.sendResetPassword(user.email, user.name, token);
      });
    }
    return ACCEPTED;
  }

  async resetPassword(raw: string, newPassword: string): Promise<void> {
    const t = await this.emailTokens.consume(raw, ['RESET_PASSWORD']);
    // Only an ACTIVE user may reset; for anyone else the token is spent and refused.
    const passwordHash = await this.passwords.hash(newPassword);
    // One transaction: the user row stays locked until every session is revoked,
    // so a refresh in flight cannot slip a new token past the revoke-all.
    const changed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: t.userId, status: 'ACTIVE' },
        data: { passwordHash },
      });
      if (count !== 1) return false;
      await tx.refreshToken.updateMany({
        where: { userId: t.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
    if (!changed) {
      throw new AppException(400, 'TOKEN_INVALID', 'Token is invalid');
    }
  }

  /** Rotates the refresh token and re-checks the account, since the DB is the source of truth. */
  async refresh(raw: string | undefined): Promise<{
    accessToken: string;
    user: UserDto;
    session: { raw: string; expiresAt: Date };
  }> {
    if (!raw) {
      throw new AppException(
        401,
        'REFRESH_INVALID',
        'Invalid or expired session',
      );
    }
    const session = await this.sessions.rotate(raw);
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (user?.status !== 'ACTIVE') {
      // The rotation just minted a token; kill it along with all the others.
      await this.sessions.revokeAll(session.userId);
      if (user?.status === 'BLOCKED') {
        throw new AppException(
          403,
          'ACCOUNT_BLOCKED',
          'This account is blocked',
        );
      }
      throw new AppException(
        401,
        'REFRESH_INVALID',
        'Invalid or expired session',
      );
    }
    return {
      accessToken: await this.tokens.signAccess(user),
      user: toUserDto(user),
      session,
    };
  }

  /** Idempotent: an absent or unknown token is not an error. */
  async logout(raw: string | undefined): Promise<void> {
    if (raw) await this.sessions.revoke(raw);
  }
}
