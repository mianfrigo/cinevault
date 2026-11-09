import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { BlockListService } from '../src/auth/blocklist.service';
import { CurrentUser, Roles } from '../src/auth/decorators';
import { EmailTokensService } from '../src/auth/email-tokens.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PasswordService } from '../src/auth/password.service';
import { RolesGuard } from '../src/auth/roles.guard';
import { TokensService } from '../src/auth/tokens.service';
import type { Role } from '../src/generated/prisma/client';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';
import { flushTestRedis, redisPttl } from './helpers/redis';

interface Sent {
  to: string;
  subject: string;
  text: string;
}

class MailRecorder {
  sent: Sent[] = [];
  sendMail(m: Sent): Promise<void> {
    this.sent.push(m);
    return Promise.resolve();
  }
  reset() {
    this.sent = [];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForMail(rec: MailRecorder, count: number, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (rec.sent.length < count && Date.now() < end) await sleep(10);
  expect(rec.sent.length).toBeGreaterThanOrEqual(count);
}

async function expectNoMoreMail(rec: MailRecorder, count: number) {
  await sleep(300);
  expect(rec.sent).toHaveLength(count);
}

const tokenOf = (m: Sent) => /token=([\w-]+)/.exec(m.text)?.[1] as string;
const rawOf = (setCookie: string) =>
  /^cv_refresh=([\w-]*)/.exec(setCookie)?.[1] as string;

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new passphrase';
const accepted = { message: 'If the address can be used, we sent an email.' };

/** Temporary routes that exercise the guards (Tasks 8-10 use them for real). */
@Controller('probe')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProbeController {
  @Get('user')
  user(@CurrentUser() u: { id: string; role: Role }) {
    return u;
  }

  @Get('admin')
  @Roles('ADMIN')
  admin(@CurrentUser() u: { id: string; role: Role }) {
    return u;
  }
}

describe('Auth sessions: refresh, logout, reset, guards (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mail: MailRecorder;
  let http: ReturnType<typeof request>;
  let tokens: TokensService;
  let blocklist: BlockListService;

  beforeAll(async () => {
    mail = new MailRecorder();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
      controllers: [ProbeController],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokensService);
    blocklist = app.get(BlockListService);
    http = request(app.getHttpServer());
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await flushTestRedis();
    mail.reset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const login = (email = 'ana@example.com', password = PASSWORD) =>
    http.post('/api/v1/auth/login').send({ email, password });
  const refresh = (raw?: string, origin?: string) => {
    // A client must send a JSON body (`{}` is enough): see AuthController.refresh.
    const r = http.post('/api/v1/auth/refresh').send({});
    if (raw !== undefined) r.set('Cookie', `cv_refresh=${raw}`);
    if (origin !== undefined) r.set('Origin', origin);
    return r;
  };
  const logout = (raw?: string) => {
    const r = http.post('/api/v1/auth/logout');
    if (raw !== undefined) r.set('Cookie', `cv_refresh=${raw}`);
    return r;
  };
  const forgot = (email: string) =>
    http.post('/api/v1/auth/forgot-password').send({ email });
  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    http.post('/api/v1/auth/reset-password').send({ token, newPassword });
  const cookieOf = (res: request.Response) =>
    (res.headers['set-cookie'] as unknown as string[])[0];

  /** Creates a user straight in the DB (the register flow is covered elsewhere). */
  async function makeUser(
    over: { email?: string; status?: 'ACTIVE' | 'PENDING' | 'BLOCKED' } & {
      role?: Role;
    } = {},
  ) {
    return prisma.user.create({
      data: {
        email: over.email ?? 'ana@example.com',
        name: 'Ana',
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        status: over.status ?? 'ACTIVE',
        role: over.role ?? 'USER',
      },
    });
  }

  /** Logs in and returns the access token and the raw refresh cookie value. */
  async function session(email = 'ana@example.com') {
    const res = await login(email).expect(200);
    return {
      accessToken: (res.body as { accessToken: string }).accessToken,
      raw: rawOf(cookieOf(res)),
    };
  }

  describe('refresh', () => {
    it('refresh with a valid cookie returns a new accessToken and a different cookie value', async () => {
      const user = await makeUser();
      const first = await session();
      const res = await refresh(first.raw).expect(200);

      const body = res.body as {
        accessToken: string;
        user: { id: string; email: string };
      };
      expect(body.user).toMatchObject({
        id: user.id,
        email: 'ana@example.com',
      });
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);
      await expect(tokens.verifyAccess(body.accessToken)).resolves.toEqual({
        sub: user.id,
        role: 'USER',
      });

      const cookie = cookieOf(res);
      expect(cookie).toMatch(/^cv_refresh=[\w-]{43};/);
      expect(rawOf(cookie)).not.toBe(first.raw);
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).not.toMatch(/; Secure/); // COOKIE_SECURE=false in .env.test
      const days =
        (Date.parse(/; Expires=([^;]+)/.exec(cookie)?.[1] as string) -
          Date.now()) /
        86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);

      // Old row revoked, new row live, and only hashes are stored.
      const rows = await prisma.refreshToken.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].revokedAt).not.toBeNull();
      expect(rows[1]).toMatchObject({
        userId: user.id,
        tokenHash: tokens.hashOpaque(rawOf(cookie)),
        revokedAt: null,
      });
      expect(JSON.stringify(rows)).not.toContain(rawOf(cookie));

      // The rotated cookie works again.
      await refresh(rawOf(cookie)).expect(200);
    });

    it('reusing the previous (rotated) refresh cookie is 401 REFRESH_INVALID and revokes the new one too', async () => {
      await makeUser();
      const first = await session();
      const second = rawOf(cookieOf(await refresh(first.raw).expect(200)));

      const reuse = await refresh(first.raw).expect(401);
      expect(reuse.body).toMatchObject({
        statusCode: 401,
        code: 'REFRESH_INVALID',
      });
      const afterReuse = await refresh(second).expect(401);
      expect((afterReuse.body as { code: string }).code).toBe(
        'REFRESH_INVALID',
      );
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('refresh with a foreign Origin header is 403', async () => {
      await makeUser();
      const first = await session();
      const res = await refresh(first.raw, 'https://evil.example').expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      expect(res.headers['set-cookie']).toBeUndefined();
      // Nothing was consumed: the cookie still works, also with the right Origin.
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(1);
      await refresh(first.raw, 'http://localhost:4200').expect(200);
    });

    it('refresh with no cookie, an unknown cookie or an expired token is 401 REFRESH_INVALID', async () => {
      await makeUser();
      const first = await session();
      for (const raw of [undefined, 'nope', 'x'.repeat(300)]) {
        const res = await refresh(raw).expect(401);
        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'REFRESH_INVALID',
        });
      }
      await prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await refresh(first.raw).expect(401);
      expect((res.body as { code: string }).code).toBe('REFRESH_INVALID');
    });

    it('refresh for a user blocked in the DB is 403 ACCOUNT_BLOCKED, revokes every session and clears the cookie', async () => {
      const user = await makeUser();
      const a = await session();
      await session(); // a second device
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'BLOCKED' },
      });
      const res = await refresh(a.raw).expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'ACCOUNT_BLOCKED',
      });
      const cookie = cookieOf(res);
      expect(rawOf(cookie)).toBe('');
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('refresh for a user who is no longer ACTIVE (PENDING) is 401 REFRESH_INVALID', async () => {
      const user = await makeUser();
      const a = await session();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'PENDING' },
      });
      const res = await refresh(a.raw).expect(401);
      expect((res.body as { code: string }).code).toBe('REFRESH_INVALID');
    });

    it('two concurrent refreshes with the same cookie: exactly one 200, the other 401, family revoked afterwards', async () => {
      await makeUser();
      const first = await session();
      const [a, b] = await Promise.all([
        refresh(first.raw),
        refresh(first.raw),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
      const winner = a.status === 200 ? a : b;
      // The loser was handled as reuse, so even the winner's new token is dead.
      await sleep(50);
      await refresh(rawOf(cookieOf(winner))).expect(401);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('refresh without Content-Type: application/json is 415 and the token is not consumed', async () => {
      await makeUser();
      const { raw } = await session();
      const cookie = `cv_refresh=${raw}`;
      const bad = [
        http.post('/api/v1/auth/refresh').set('Cookie', cookie),
        http
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookie)
          .type('text/plain')
          .send('hello'),
        http
          .post('/api/v1/auth/refresh')
          .set('Cookie', cookie)
          .type('form')
          .send({ a: '1' }),
      ];
      for (const r of bad) {
        const res = await r.expect(415);
        expect(res.body).toMatchObject({
          statusCode: 415,
          code: 'UNSUPPORTED_MEDIA_TYPE',
        });
        expect(res.headers['set-cookie']).toBeUndefined();
      }
      // The check runs before the Origin check and before anything is consumed.
      await http
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(415);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(1);
      await refresh(raw).expect(200);
    });

    it('a refresh waiting behind a lock on the user cannot leave a live token after the revoke-all that held it', async () => {
      const user = await makeUser();
      const { raw } = await session();
      let pending!: Promise<request.Response>;
      let done = false;
      await prisma.$transaction(async (tx) => {
        // Stands in for reset-password / block: holds the user row, then revokes all.
        await tx.user.update({
          where: { id: user.id },
          data: { name: 'Ana 2' },
        });
        pending = refresh(raw).then((r) => {
          done = true;
          return r;
        });
        await sleep(400);
        expect(done).toBe(false); // rotation is blocked on the user row lock
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
      expect((await pending).status).toBe(401);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('a rotation holding the user row makes a concurrent reset wait, so the new token is revoked too', async () => {
      const user = await makeUser();
      await session();
      const token = await app
        .get(EmailTokensService)
        .issue(user.id, 'RESET_PASSWORD');
      let pending!: Promise<request.Response>;
      let done = false;
      await prisma.$transaction(async (tx) => {
        // What rotate does: share-lock the user, then insert the new token.
        await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${user.id} FOR SHARE`;
        pending = reset(token).then((r) => {
          done = true;
          return r;
        });
        await sleep(400);
        expect(done).toBe(false);
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash: 'inflight-rotation',
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
      });
      expect((await pending).status).toBe(204);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('refresh racing reset-password never leaves a live refresh token or the old password', async () => {
      const user = await makeUser();
      const emailTokens = app.get(EmailTokensService);
      for (let i = 0; i < 8; i++) {
        const { raw } = await session();
        const token = await emailTokens.issue(user.id, 'RESET_PASSWORD');
        const [r, p] = await Promise.all([refresh(raw), reset(token)]);
        expect(p.status).toBe(204);
        expect([200, 401]).toContain(r.status);
        expect(
          await prisma.refreshToken.count({ where: { revokedAt: null } }),
        ).toBe(0);
        await login('ana@example.com', PASSWORD).expect(401);
        // Put the original password back for the next round.
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: await app.get(PasswordService).hash(PASSWORD) },
        });
        await prisma.refreshToken.updateMany({
          data: { revokedAt: new Date() },
        });
      }
    });
  });

  describe('logout', () => {
    it('logout revokes the token and clears the cookie; refresh afterwards is 401', async () => {
      await makeUser();
      const { raw } = await session();
      const res = await logout(raw).expect(204);
      const cookie = cookieOf(res);
      expect(rawOf(cookie)).toBe('');
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/; Expires=Thu, 01 Jan 1970/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      await refresh(raw).expect(401);
    });

    it('logout without a cookie or with an unknown one is still 204', async () => {
      await logout().expect(204);
      await logout('nope').expect(204);
    });
  });

  describe('forgot-password', () => {
    it('forgot-password returns 202 for unknown and known emails and sends mail only for the known active user', async () => {
      await makeUser({ email: 'active@example.com' });
      await makeUser({ email: 'pending@example.com', status: 'PENDING' });
      await makeUser({ email: 'blocked@example.com', status: 'BLOCKED' });
      const bodies: unknown[] = [];
      for (const email of [
        'ghost@example.com',
        'pending@example.com',
        'blocked@example.com',
        ' ACTIVE@example.com ',
      ]) {
        const res = await forgot(email).expect(202);
        bodies.push(res.body);
      }
      for (const b of bodies) expect(b).toEqual(accepted);
      await waitForMail(mail, 1);
      await expectNoMoreMail(mail, 1);
      expect(mail.sent[0]).toMatchObject({
        to: 'active@example.com',
        subject: expect.stringMatching(/password/i) as unknown,
      });
      expect(await prisma.emailToken.count()).toBe(1);
      expect(await prisma.emailToken.findFirst()).toMatchObject({
        type: 'RESET_PASSWORD',
      });
    });

    it('rejects a malformed email with 400', async () => {
      await forgot('nope').expect(400);
    });
  });

  describe('reset-password', () => {
    async function resetToken(email = 'ana@example.com') {
      const before = mail.sent.length;
      await forgot(email).expect(202);
      await waitForMail(mail, before + 1);
      return tokenOf(mail.sent[before]);
    }

    it('reset-password with a valid token changes the password, old password no longer logs in, all refresh tokens are revoked', async () => {
      await makeUser();
      const a = await session();
      await session();
      const token = await resetToken();
      await reset(token).expect(204);

      await login('ana@example.com', PASSWORD).expect(401);
      await login('ana@example.com', NEW_PASSWORD).expect(200);
      // Only the session created by the login just above is alive.
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(1);
      await refresh(a.raw).expect(401);
      const user = await prisma.user.findFirstOrThrow();
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('a reset token cannot be used twice', async () => {
      await makeUser();
      const token = await resetToken();
      await reset(token).expect(204);
      const again = await reset(token, 'yet another passphrase').expect(400);
      expect((again.body as { code: string }).code).toBe('TOKEN_INVALID');
      await login('ana@example.com', NEW_PASSWORD).expect(200);
    });

    it('an expired token is 400 TOKEN_EXPIRED and the password is unchanged', async () => {
      await makeUser();
      const token = await resetToken();
      await prisma.emailToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await reset(token).expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_EXPIRED');
      await login('ana@example.com', PASSWORD).expect(200);
    });

    it('an unknown token and a verify-email token are 400 TOKEN_INVALID', async () => {
      const user = await makeUser();
      const res = await reset('nope').expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
      const verifyTok = await app
        .get(EmailTokensService)
        .issue(user.id, 'VERIFY_EMAIL');
      await reset(verifyTok).expect(400);
    });

    it('a token of a user who was blocked meanwhile is 400, spent, and the password is unchanged', async () => {
      const user = await makeUser();
      const token = await resetToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'BLOCKED' },
      });
      const before = (
        await prisma.user.findUniqueOrThrow({
          where: { id: user.id },
        })
      ).passwordHash;
      const res = await reset(token).expect(400);
      expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .passwordHash,
      ).toBe(before);
      expect(await prisma.emailToken.count({ where: { usedAt: null } })).toBe(
        0,
      );
    });

    it('validates the new password length (10..128) and unknown fields', async () => {
      await makeUser();
      const token = await resetToken();
      await reset(token, 'short-pw9').expect(400);
      await reset(token, 'x'.repeat(129)).expect(400);
      await http
        .post('/api/v1/auth/reset-password')
        .send({ token, newPassword: NEW_PASSWORD, role: 'ADMIN' })
        .expect(400);
      // The token survived the rejected attempts.
      await reset(token).expect(204);
    });

    it('replaying the same token concurrently succeeds exactly once', async () => {
      await makeUser();
      const token = await resetToken();
      const results = await Promise.all(
        Array.from({ length: 3 }, () => reset(token)),
      );
      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    });
  });

  describe('guards and block list', () => {
    const get = (path: string, auth?: string) => {
      const r = http.get(`/api/v1/probe/${path}`);
      if (auth !== undefined) r.set('Authorization', auth);
      return r;
    };

    it('a valid Bearer token reaches the route with {id, role}; the scheme is case-insensitive', async () => {
      const user = await makeUser();
      const { accessToken } = await session();
      const res = await get('user', `Bearer ${accessToken}`).expect(200);
      expect(res.body).toEqual({ id: user.id, role: 'USER' });
      await get('user', `bearer ${accessToken}`).expect(200);
    });

    it('missing or malformed Authorization header is 401', async () => {
      await makeUser();
      const { accessToken } = await session();
      const expired = await new JwtService().signAsync(
        { sub: 'x', role: 'USER' },
        {
          secret: 'test-secret-test-secret-test-secret-00',
          expiresIn: -10,
        },
      );
      for (const header of [
        undefined,
        '',
        'Bearer',
        'Bearer ',
        `Bearer ${accessToken} extra`,
        `Basic ${accessToken}`,
        accessToken,
        'Bearer not.a.jwt',
        `Bearer ${accessToken}x`,
        `Bearer ${expired}`,
      ]) {
        const res = await get('user', header).expect(401);
        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }
    });

    it('an access token of a user who was just blocked gets 403 ACCOUNT_BLOCKED on a guarded route', async () => {
      const user = await makeUser();
      const { accessToken } = await session();
      await get('user', `Bearer ${accessToken}`).expect(200);
      await blocklist.block(user.id);
      const res = await get('user', `Bearer ${accessToken}`).expect(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        code: 'ACCOUNT_BLOCKED',
      });
      await blocklist.unblock(user.id);
      await get('user', `Bearer ${accessToken}`).expect(200);
    });

    it('block stores blocked:<id> in Redis with a 600s TTL', async () => {
      const user = await makeUser();
      await blocklist.block(user.id);
      expect(await blocklist.isBlocked(user.id)).toBe(true);
      const ttl = await redisPttl(`blocked:${user.id}`);
      expect(ttl).toBeGreaterThan(590_000);
      expect(ttl).toBeLessThanOrEqual(600_000);
    });

    it('RolesGuard: USER on an ADMIN route is 403', async () => {
      await makeUser();
      const { accessToken } = await session();
      const res = await get('admin', `Bearer ${accessToken}`).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('RolesGuard: ADMIN on an ADMIN route is 200', async () => {
      const admin = await makeUser({ role: 'ADMIN' });
      const { accessToken } = await session();
      const res = await get('admin', `Bearer ${accessToken}`).expect(200);
      expect(res.body).toEqual({ id: admin.id, role: 'ADMIN' });
    });
  });
});
