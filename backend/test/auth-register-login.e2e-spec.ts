import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EmailTokensService } from '../src/auth/email-tokens.service';
import { PasswordService } from '../src/auth/password.service';
import { TokensService } from '../src/auth/tokens.service';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';
import { expectNoMoreMail, sleep, waitForMail } from './helpers/wait';

interface Sent {
  to: string;
  subject: string;
  text: string;
}

/** Records mail instead of sending it; `failWith` makes every send reject. */
class MailRecorder {
  sent: Sent[] = [];
  failWith?: Error;
  sendMail(m: Sent): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(m);
    return Promise.resolve();
  }
  reset() {
    this.sent = [];
    this.failWith = undefined;
  }
}

const tokenOf = (m: Sent) => /token=([\w-]+)/.exec(m.text)?.[1] as string;

const PASSWORD = 'correct horse battery';
const accepted = {
  message: 'If the address can be used, we sent an email.',
};

describe('Auth: register, verify, resend, login (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mail: MailRecorder;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    mail = new MailRecorder();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    mail.reset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const register = (body: object) =>
    http.post('/api/v1/auth/register').send(body);
  const login = (email: string, password = PASSWORD) =>
    http.post('/api/v1/auth/login').send({ email, password });
  const verify = (token: string) =>
    http.post('/api/v1/auth/verify-email').send({ token });

  /** Registers and verifies a user through the public API. */
  async function activeUser(email = 'ana@example.com') {
    await register({ name: 'Ana', email, password: PASSWORD }).expect(202);
    await waitForMail(mail, 1);
    await verify(tokenOf(mail.sent[0])).expect(204);
    mail.reset();
  }

  const ana = { name: 'Ana', email: 'ana@example.com', password: PASSWORD };

  describe('register', () => {
    it('register creates a PENDING user and sends one verify email', async () => {
      const res = await register({ ...ana, name: '  Ana  ' }).expect(202);
      expect(res.body).toEqual(accepted);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      expect(mail.sent[0].to).toBe('ana@example.com');
      expect(mail.sent[0].subject).toBe('Verify your Cinevault email');
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user).toMatchObject({
        status: 'PENDING',
        role: 'USER',
        name: 'Ana',
        emailVerifiedAt: null,
      });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
      const stored = await prisma.emailToken.findMany();
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).not.toBe(tokenOf(mail.sent[0])); // only the hash is stored
    });

    it('register with the same email in other case or with spaces returns the same 202 and creates no second user', async () => {
      await register(ana).expect(202);
      for (const email of ['ANA@Example.com', '  ana@example.com  ']) {
        const res = await register({ ...ana, name: 'Other', email });
        expect(res.status).toBe(202);
        expect(res.body).toEqual(accepted);
      }
      expect(await prisma.user.count()).toBe(1);
      await waitForMail(mail, 3);
      await expectNoMoreMail(mail, 3);
    });

    it('register again while PENDING replaces name and password hash and sends a new verify email', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      const before = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      const newPassword = 'a completely different password';
      const res = await register({
        ...ana,
        name: 'Ana Two',
        password: newPassword,
      }).expect(202);
      expect(res.body).toEqual(accepted);
      await waitForMail(mail, 2);
      await expectNoMoreMail(mail, 2);
      expect(mail.sent[1].subject).toBe('Verify your Cinevault email');
      expect(mail.sent[0].text).toContain('Hi Ana,');
      expect(mail.sent[1].text).toContain('Hi Ana Two,'); // the new name, not the stale one
      const after = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(after.passwordHash).not.toBe(before.passwordHash);
      expect(after.passwordHash).toMatch(/^\$argon2id\$/);
      expect(after.name).toBe('Ana Two');
      expect(after.status).toBe('PENDING');
      // The first link no longer works, the new one does.
      await verify(tokenOf(mail.sent[0])).expect(400);
      await verify(tokenOf(mail.sent[1])).expect(204);
      // Only the latest submission's password works.
      await login('ana@example.com', PASSWORD).expect(401);
      await login('ana@example.com', newPassword).expect(200);
    });

    it('a PENDING account that became ACTIVE before the replacement is left untouched and gets no mail', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      mail.reset();
      const stale = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      await prisma.user.update({
        where: { id: stale.id },
        data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      // The lookup still sees the PENDING row, as if verification landed right after it.
      const lookup = jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(stale);
      let body: unknown;
      try {
        body = (
          await register({
            ...ana,
            name: 'Mallory',
            password: 'a completely different password',
          }).expect(202)
        ).body;
      } finally {
        lookup.mockRestore();
      }
      expect(body).toEqual(accepted);
      await expectNoMoreMail(mail, 0);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: stale.id },
      });
      expect(after).toMatchObject({
        name: 'Ana',
        passwordHash: stale.passwordHash,
        status: 'ACTIVE',
      });
    });

    it('register with a verified email sends the already-registered email and no verify token', async () => {
      await activeUser();
      const res = await register(ana).expect(202);
      expect(res.body).toEqual(accepted);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      expect(mail.sent[0].subject).toBe('You already have a Cinevault account');
      expect(mail.sent[0].text).not.toMatch(/token=/);
      expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(
        0,
      );
      expect(await prisma.user.count()).toBe(1);
    });

    it('register with a blocked email answers the same 202 and sends only the already-registered email', async () => {
      await activeUser();
      await prisma.user.update({
        where: { email: 'ana@example.com' },
        data: { status: 'BLOCKED' },
      });
      const res = await register(ana).expect(202);
      expect(res.body).toEqual(accepted);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      expect(mail.sent[0].subject).toBe('You already have a Cinevault account');
    });

    it('two concurrent registrations of the same email are both 202 and create one user', async () => {
      const body = { ...ana, email: 'race@example.com' };
      const [a, b] = await Promise.all([register(body), register(body)]);
      expect([a.status, b.status]).toEqual([202, 202]);
      expect(a.body).toEqual(accepted);
      expect(b.body).toEqual(accepted);
      expect(await prisma.user.count()).toBe(1);
      // The loser either lost the create (no mail) or found the PENDING row (one more).
      await waitForMail(mail, 1);
      await sleep(300);
    });

    it('losing the create race (unique violation) is a 202, sends no mail and creates no second user', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      mail.reset();
      // The lookup misses the row the winner just committed, so create() hits P2002.
      const lookup = jest
        .spyOn(prisma.user, 'findUnique')
        .mockResolvedValueOnce(null);
      let body: unknown;
      try {
        body = (await register({ ...ana, name: 'Loser' }).expect(202)).body;
      } finally {
        lookup.mockRestore();
      }
      expect(body).toEqual(accepted);
      await expectNoMoreMail(mail, 0);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.user.findFirst()).toMatchObject({ name: 'Ana' });
    });

    it('a failing mail transport does not change the 202 and logs no address or token', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      mail.failWith = new Error('smtp down for ana@example.com');
      const res = await register(ana).expect(202);
      expect(res.body).toEqual(accepted);
      const end = Date.now() + 3000;
      while (warn.mock.calls.length === 0 && Date.now() < end) await sleep(10);
      expect(warn).toHaveBeenCalled();
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain('ana@example.com');
      expect(logged).not.toContain('smtp down');
      expect(logged).toContain('Error');
    });

    it('password shorter than 10 chars is 400', async () => {
      const res = await register({ ...ana, password: 'short-pw9' }).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects an over-long password, a bad email, a blank or long name and unknown fields', async () => {
      await register({ ...ana, password: 'x'.repeat(129) }).expect(400);
      await register({ ...ana, email: 'not-an-email' }).expect(400);
      await register({ ...ana, name: '   ' }).expect(400);
      await register({ ...ana, name: 'n'.repeat(81) }).expect(400);
      await register({ ...ana, role: 'ADMIN' }).expect(400);
      await register({ ...ana, password: 'x'.repeat(128) }).expect(202);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
    });

    it('does not trim the password', async () => {
      await register({ ...ana, password: `  ${PASSWORD}  ` }).expect(202);
      await waitForMail(mail, 1);
      await verify(tokenOf(mail.sent[0])).expect(204);
      await login('ana@example.com', PASSWORD).expect(401);
      await login('ana@example.com', `  ${PASSWORD}  `).expect(200);
    });
  });

  describe('verify-email', () => {
    it('verify-email with the emailed token activates the user; reusing it is 400 TOKEN_INVALID; an expired token is 400 TOKEN_EXPIRED', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      const token = tokenOf(mail.sent[0]);
      await verify(token).expect(204);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user.status).toBe('ACTIVE');
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);

      const reused = await verify(token).expect(400);
      expect(reused.body).toMatchObject({
        statusCode: 400,
        code: 'TOKEN_INVALID',
      });

      // Expired: a fresh PENDING user whose token lapsed.
      await register({ ...ana, email: 'bo@example.com' }).expect(202);
      await waitForMail(mail, 2);
      await prisma.emailToken.updateMany({
        where: { user: { email: 'bo@example.com' } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await verify(tokenOf(mail.sent[1])).expect(400);
      expect(expired.body).toMatchObject({
        statusCode: 400,
        code: 'TOKEN_EXPIRED',
      });
      const bo = await prisma.user.findUniqueOrThrow({
        where: { email: 'bo@example.com' },
      });
      expect(bo.status).toBe('PENDING');
    });

    it('an unknown token is 400 TOKEN_INVALID', async () => {
      const res = await verify('nope').expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
    });

    it('replaying the same token concurrently succeeds exactly once', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      const token = tokenOf(mail.sent[0]);
      const results = await Promise.all(
        Array.from({ length: 4 }, () => verify(token)),
      );
      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(3);
    });

    it('a blocked user stays blocked when a verify token is consumed', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      await prisma.user.update({
        where: { email: 'ana@example.com' },
        data: { status: 'BLOCKED' },
      });
      await verify(tokenOf(mail.sent[0])).expect(204);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user.status).toBe('BLOCKED');
      expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(
        0,
      );
    });

    it('a CHANGE_EMAIL token sets the new email; a taken address is 400 TOKEN_INVALID', async () => {
      await activeUser('ana@example.com');
      await activeUser('bo@example.com');
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      const emailTokens = app.get(EmailTokensService);
      const ok = await emailTokens.issue(user.id, 'CHANGE_EMAIL', {
        newEmail: 'ana.new@example.com',
      });
      await verify(ok).expect(204);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
      ).toBe('ana.new@example.com');

      const clash = await emailTokens.issue(user.id, 'CHANGE_EMAIL', {
        newEmail: 'bo@example.com',
      });
      const res = await verify(clash).expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
      ).toBe('ana.new@example.com');
    });

    it('a CHANGE_EMAIL token for a BLOCKED or PENDING user is spent and fails with 400 TOKEN_INVALID, email unchanged', async () => {
      const emailTokens = app.get(EmailTokensService);
      for (const status of ['BLOCKED', 'PENDING'] as const) {
        await resetDb(prisma);
        await activeUser();
        const user = await prisma.user.update({
          where: { email: 'ana@example.com' },
          data: { status },
        });
        const token = await emailTokens.issue(user.id, 'CHANGE_EMAIL', {
          newEmail: 'ana.new@example.com',
        });
        const res = await verify(token).expect(400);
        expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
            .email,
        ).toBe('ana@example.com');
        expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(
          0,
        );
      }
    });

    it('a token of another type (RESET_PASSWORD) is rejected and not consumed', async () => {
      await activeUser();
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      const reset = await app
        .get(EmailTokensService)
        .issue(user.id, 'RESET_PASSWORD');
      const res = await verify(reset).expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
      expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(
        1,
      );
    });

    it('issue invalidates earlier unused tokens of the same user and type only', async () => {
      await activeUser();
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      const svc = app.get(EmailTokensService);
      const reset1 = await svc.issue(user.id, 'RESET_PASSWORD');
      const change = await svc.issue(user.id, 'CHANGE_EMAIL', {
        newEmail: 'x@example.com',
      });
      const reset2 = await svc.issue(user.id, 'RESET_PASSWORD');
      await expect(
        svc.consume(reset1, ['RESET_PASSWORD']),
      ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
      await expect(
        svc.consume(reset2, ['RESET_PASSWORD']),
      ).resolves.toMatchObject({ type: 'RESET_PASSWORD' });
      await expect(
        svc.consume(change, ['CHANGE_EMAIL']),
      ).resolves.toMatchObject({ newEmail: 'x@example.com' });
    });
  });

  describe('resend-verification', () => {
    const resend = (email: string) =>
      http.post('/api/v1/auth/resend-verification').send({ email });

    it('sends a new verify email only to a PENDING user and invalidates the old token', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      const res = await resend(' ANA@example.com ').expect(202);
      expect(res.body).toEqual(accepted);
      await waitForMail(mail, 2);
      await expectNoMoreMail(mail, 2);
      await verify(tokenOf(mail.sent[0])).expect(400);
      await verify(tokenOf(mail.sent[1])).expect(204);
    });

    it('unknown, active and blocked addresses get the same 202 and no mail', async () => {
      await activeUser('active@example.com');
      await activeUser('blocked@example.com');
      await prisma.user.update({
        where: { email: 'blocked@example.com' },
        data: { status: 'BLOCKED' },
      });
      for (const email of [
        'ghost@example.com',
        'active@example.com',
        'blocked@example.com',
      ]) {
        const res = await resend(email).expect(202);
        expect(res.body).toEqual(accepted);
      }
      await expectNoMoreMail(mail, 0);
    });

    it('rejects a malformed email with 400', async () => {
      await resend('nope').expect(400);
    });
  });

  describe('login', () => {
    it('login before verification is 403 EMAIL_NOT_VERIFIED', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      const res = await login('ana@example.com').expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
      });
    });

    it('wrong password and unknown email both give 401 INVALID_CREDENTIALS with identical bodies', async () => {
      await activeUser();
      const wrong = await login('ana@example.com', 'wrong password!').expect(
        401,
      );
      const unknown = await login('ghost@example.com').expect(401);
      expect(wrong.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: expect.any(String) as unknown,
      });
      expect(unknown.body).toEqual(wrong.body);
      expect(wrong.headers['set-cookie']).toBeUndefined();
    });

    it('a wrong password never reveals PENDING or BLOCKED status', async () => {
      await register(ana).expect(202);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      const pending = await login('ana@example.com', 'wrong password!').expect(
        401,
      );
      expect((pending.body as { code: string }).code).toBe(
        'INVALID_CREDENTIALS',
      );
      await prisma.user.update({
        where: { email: 'ana@example.com' },
        data: { status: 'BLOCKED' },
      });
      const blocked = await login('ana@example.com', 'wrong password!').expect(
        401,
      );
      expect((blocked.body as { code: string }).code).toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('blocked user gets 403 ACCOUNT_BLOCKED', async () => {
      await activeUser();
      await prisma.user.update({
        where: { email: 'ana@example.com' },
        data: { status: 'BLOCKED' },
      });
      const res = await login('ana@example.com').expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'ACCOUNT_BLOCKED',
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('successful login returns accessToken and user without passwordHash and sets the cv_refresh cookie httpOnly with path /api/v1/auth', async () => {
      await activeUser();
      const res = await login('  ANA@example.com ').expect(200);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(res.body).toEqual({
        accessToken: expect.any(String) as unknown,
        user: {
          id: user.id,
          email: 'ana@example.com',
          name: 'Ana',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: user.createdAt.toISOString(),
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
      const tokens = app.get(TokensService);
      await expect(
        tokens.verifyAccess((res.body as { accessToken: string }).accessToken),
      ).resolves.toEqual({
        sub: user.id,
        role: 'USER',
      });

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toHaveLength(1);
      const cookie = cookies[0];
      expect(cookie).toMatch(/^cv_refresh=[\w-]{43};/);
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).not.toMatch(/; Secure/); // COOKIE_SECURE=false in .env.test
      const expires = /; Expires=([^;]+)/.exec(cookie)?.[1] as string;
      const days = (Date.parse(expires) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);

      // Only the sha256 hash is stored, and it matches the cookie.
      const raw = /^cv_refresh=([\w-]+)/.exec(cookie)?.[1] as string;
      const rows = await prisma.refreshToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: user.id,
        tokenHash: tokens.hashOpaque(raw),
        revokedAt: null,
      });
    });
  });

  describe('PasswordService', () => {
    it('hashes with argon2id and verifies', async () => {
      const passwords = app.get(PasswordService);
      const hash = await passwords.hash('some password 123');
      expect(hash).toMatch(/^\$argon2id\$/);
      await expect(passwords.verify(hash, 'some password 123')).resolves.toBe(
        true,
      );
      await expect(passwords.verify(hash, 'other password')).resolves.toBe(
        false,
      );
    });
  });
});
