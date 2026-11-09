import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/app.exception';
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

  /**
   * Runs `job` without awaiting it, so SMTP latency or failure cannot change the
   * response. Logs only the error class: never an address, token or link.
   */
  private background(what: string, job: () => Promise<void>): void {
    void job().catch((e: unknown) =>
      this.logger.warn(
        `${what} failed: ${e instanceof Error ? e.name : 'Unknown error'}`,
      ),
    );
  }

  private sendVerification(user: Pick<User, 'id' | 'email' | 'name'>): void {
    this.background('verification mail', async () => {
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
      // Name and password of the first attempt are kept.
      this.sendVerification(existing);
    } else {
      this.background('already-registered mail', () =>
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
      await this.prisma.user.update({
        where: { id: t.userId },
        data: { email: normalizeEmail(t.newEmail) },
      });
    } catch (e) {
      // Address taken meanwhile (P2002) or account deleted meanwhile (P2025).
      if (isPrismaError(e, 'P2002') || isPrismaError(e, 'P2025')) {
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
}
