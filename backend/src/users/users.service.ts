import { Injectable, Logger } from '@nestjs/common';
import { ACCEPTED } from '../auth/auth.service';
import { normalizeEmail } from '../auth/email';
import { EmailTokensService } from '../auth/email-tokens.service';
import { PasswordService } from '../auth/password.service';
import { SessionsService } from '../auth/sessions.service';
import { AppException } from '../common/app.exception';
import { runInBackground } from '../common/background';
import type { User } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto, type UserDto } from './user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly emailTokens: EmailTokensService,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
  ) {}

  /** The token outlives the account (deleted meanwhile): same answer as a bad token. */
  private async load(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppException(401, 'UNAUTHORIZED', 'Missing or malformed token');
    }
    return user;
  }

  /** Loads the user and checks the password; `code` is the 400 for a wrong one. */
  private async authenticate(
    id: string,
    password: string,
    code: 'OLD_PASSWORD_WRONG' | 'PASSWORD_WRONG',
  ): Promise<User> {
    const user = await this.load(id);
    // The block list fails open, so the DB status is re-checked here: a blocked
    // (or not yet verified) account must not change credentials or delete itself.
    if (user.status === 'BLOCKED') {
      throw new AppException(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppException(401, 'UNAUTHORIZED', 'Missing or malformed token');
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new AppException(400, code, 'Password is incorrect');
    }
    return user;
  }

  async getMe(id: string): Promise<UserDto> {
    return toUserDto(await this.load(id));
  }

  async updateName(id: string, name: string): Promise<UserDto> {
    await this.prisma.user.updateMany({ where: { id }, data: { name } });
    return this.getMe(id);
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    // The old password is checked before the (expensive) hash of the new one.
    const user = await this.authenticate(id, oldPassword, 'OLD_PASSWORD_WRONG');
    const passwordHash = await this.passwords.hash(newPassword);
    // One transaction: the user row stays locked until every session is revoked,
    // so a refresh in flight cannot slip a new token past the revoke-all.
    // The refresh cookie never reaches /me, so the current session cannot be
    // spared; the client logs out afterwards.
    await this.prisma.$transaction(async (tx) => {
      // Conditional on the hash the old password was verified against: of two
      // concurrent calls the loser finds the hash already replaced, so its old
      // password is no longer the current one (400 OLD_PASSWORD_WRONG).
      const { count } = await tx.user.updateMany({
        where: { id, passwordHash: user.passwordHash },
        data: { passwordHash },
      });
      if (count !== 1) {
        await this.load(id); // deleted meanwhile: 401
        throw new AppException(
          400,
          'OLD_PASSWORD_WRONG',
          'Password is incorrect',
        );
      }
      await this.sessions.revokeAll(id, tx);
    });
  }

  /**
   * Always answers 202 once the password is right, so it cannot be used to learn
   * which addresses are registered. The mail goes to the NEW address; the email
   * changes only when the link is consumed (POST /auth/verify-email).
   */
  async requestEmailChange(
    id: string,
    newEmail: string,
    password: string,
  ): Promise<typeof ACCEPTED> {
    const user = await this.authenticate(id, password, 'PASSWORD_WRONG');
    const email = normalizeEmail(newEmail);
    // Looked up on every path (also for the user's own address, which exists too).
    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (!taken) {
      runInBackground(this.logger, 'change-email mail', async () => {
        const token = await this.emailTokens.issue(id, 'CHANGE_EMAIL', {
          newEmail: email,
        });
        await this.mail.sendChangeEmail(email, user.name, token);
      });
    }
    return ACCEPTED;
  }

  async deleteAccount(id: string, password: string): Promise<void> {
    await this.authenticate(id, password, 'PASSWORD_WRONG');
    await this.prisma.$transaction(async (tx) => {
      // Locks every active admin (in id order, so two deleters cannot deadlock) until
      // commit: of two admins deleting themselves at once, the second waits, then
      // sees only itself left. Locked for any user, so a role change cannot race.
      const admins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
      if (admins.length === 1 && admins[0].id === id) {
        throw new AppException(
          409,
          'LAST_ADMIN',
          'The last active admin cannot be deleted',
        );
      }
      // Favorites and tokens go with the user (ON DELETE CASCADE).
      await tx.user.deleteMany({ where: { id } });
    });
  }

  async countActiveAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
  }
}
