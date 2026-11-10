import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BlockListService } from '../src/auth/blocklist.service';
import { PasswordService } from '../src/auth/password.service';
import type { Role } from '../src/generated/prisma/client';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';
import { flushTestRedis } from './helpers/redis';
import { sleep, waitForMail } from './helpers/wait';

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

async function expectNoMail(rec: MailRecorder) {
  await sleep(300);
  expect(rec.sent).toHaveLength(0);
}

const tokenOf = (m: Sent) => /token=([\w-]+)/.exec(m.text)?.[1] as string;
const rawOf = (setCookie: string) =>
  /^cv_refresh=([\w-]*)/.exec(setCookie)?.[1] as string;

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new passphrase';
const accepted = { message: 'If the address can be used, we sent an email.' };

describe('Me endpoints (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mail: MailRecorder;
  let http: ReturnType<typeof request>;
  let blocklist: BlockListService;
  let passwordHash: string;

  beforeAll(async () => {
    mail = new MailRecorder();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    blocklist = app.get(BlockListService);
    http = request(app.getHttpServer());
    passwordHash = await app.get(PasswordService).hash(PASSWORD);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await flushTestRedis();
    mail.reset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  /** Creates an ACTIVE user straight in the DB (the register flow is covered elsewhere). */
  const makeUser = (email = 'ana@example.com', role: Role = 'USER') =>
    prisma.user.create({
      data: { email, name: 'Ana', passwordHash, status: 'ACTIVE', role },
    });

  const login = (email: string, password = PASSWORD) =>
    http.post('/api/v1/auth/login').send({ email, password });

  /** Signs in through the real endpoint: access token and raw refresh cookie. */
  async function signIn(email = 'ana@example.com') {
    const res = await login(email).expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    return {
      token: (res.body as { accessToken: string }).accessToken,
      raw: rawOf(cookie),
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = (t: string) => http.get('/api/v1/me').set(auth(t));
  const patchMe = (t: string, body: unknown) =>
    http
      .patch('/api/v1/me')
      .set(auth(t))
      .send(body as object);
  const changePassword = (t: string, body: unknown) =>
    http
      .post('/api/v1/me/change-password')
      .set(auth(t))
      .send(body as object);
  const changeEmail = (t: string, body: unknown) =>
    http
      .post('/api/v1/me/change-email')
      .set(auth(t))
      .send(body as object);
  const deleteMe = (t: string, body: unknown) =>
    http
      .delete('/api/v1/me')
      .set(auth(t))
      .send(body as object);
  const refresh = (raw: string) =>
    http
      .post('/api/v1/auth/refresh')
      .set('Cookie', `cv_refresh=${raw}`)
      .send({});

  it('GET /me returns the user without passwordHash', async () => {
    const user = await makeUser();
    const { token } = await signIn();
    const res = await me(token).expect(200);
    expect(res.body).toEqual({
      id: user.id,
      email: 'ana@example.com',
      name: 'Ana',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: user.createdAt.toISOString(),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  describe('PATCH /me', () => {
    it('PATCH /me trims name and rejects empty or over 80 chars', async () => {
      const user = await makeUser();
      const { token } = await signIn();

      const ok = await patchMe(token, { name: 'Ana ' }).expect(200);
      expect(ok.body).toMatchObject({ id: user.id, name: 'Ana' });
      expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|argon2/);

      const long = await patchMe(token, { name: 'x'.repeat(80) }).expect(200);
      expect((long.body as { name: string }).name).toBe('x'.repeat(80));

      for (const name of ['', 'x'.repeat(81), 5, undefined]) {
        const res = await patchMe(token, { name }).expect(400);
        expect(res.body).toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name,
      ).toBe('x'.repeat(80));
    });

    it('PATCH /me with a whitespace-only name is 400 and cannot change anything else', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      await patchMe(token, { name: '   ' }).expect(400);
      await patchMe(token, { name: 'Bo', role: 'ADMIN' }).expect(400);
      await patchMe(token, { name: 'Bo', email: 'x@example.com' }).expect(400);
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row).toMatchObject({
        name: 'Ana',
        role: 'USER',
        email: 'ana@example.com',
      });
    });
  });

  describe('change-password', () => {
    it('change-password with wrong old password is 400 OLD_PASSWORD_WRONG', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      const res = await changePassword(token, {
        oldPassword: 'not the password',
        newPassword: NEW_PASSWORD,
      }).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'OLD_PASSWORD_WRONG',
      });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .passwordHash,
      ).toBe(passwordHash);
      await login('ana@example.com').expect(200);
    });

    it('change-password success lets login work with the new password only and revokes every refresh token', async () => {
      await makeUser();
      const a = await signIn();
      const b = await signIn(); // a second device

      await changePassword(a.token, {
        oldPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await login('ana@example.com', PASSWORD).expect(401);
      await login('ana@example.com', NEW_PASSWORD).expect(200);
      for (const old of [a.raw, b.raw]) {
        const res = await refresh(old).expect(401);
        expect((res.body as { code: string }).code).toBe('REFRESH_INVALID');
      }
    });

    it('change-password rejects a too short, too long or missing new password with 400 and changes nothing', async () => {
      await makeUser();
      const { token } = await signIn();
      for (const newPassword of ['123456789', 'x'.repeat(129), undefined]) {
        const res = await changePassword(token, {
          oldPassword: PASSWORD,
          newPassword,
        }).expect(400);
        expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
      }
      // An oversized old password is refused before any hashing.
      await changePassword(token, {
        oldPassword: 'x'.repeat(129),
        newPassword: NEW_PASSWORD,
      }).expect(400);
      await login('ana@example.com', PASSWORD).expect(200);
    });
  });

  describe('change-email', () => {
    it('change-email with the wrong password is 400 PASSWORD_WRONG and sends nothing', async () => {
      await makeUser();
      const { token } = await signIn();
      const res = await changeEmail(token, {
        newEmail: 'new@example.com',
        password: 'not the password',
      }).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'PASSWORD_WRONG',
      });
      await expectNoMail(mail);
      expect(await prisma.emailToken.count()).toBe(0);
    });

    it('change-email with an invalid address is 400 VALIDATION_ERROR', async () => {
      await makeUser();
      const { token } = await signIn();
      const res = await changeEmail(token, {
        newEmail: 'not-an-email',
        password: PASSWORD,
      }).expect(400);
      expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
    });

    it('change-email sends mail to the new address and the email changes only after verify-email', async () => {
      const user = await makeUser();
      const { token } = await signIn();

      const res = await changeEmail(token, {
        newEmail: '  New@Example.com ',
        password: PASSWORD,
      }).expect(202);
      expect(res.body).toEqual(accepted);

      await waitForMail(mail, 1);
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe('new@example.com');
      expect(mail.sent[0].text).toMatch(/\/verify-email\?token=/);
      // Nothing changes before the link is used.
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
      ).toBe('ana@example.com');

      await http
        .post('/api/v1/auth/verify-email')
        .send({ token: tokenOf(mail.sent[0]) })
        .expect(204);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
      ).toBe('new@example.com');
      await login('ana@example.com').expect(401);
      await login('new@example.com').expect(200);
    });

    it('change-email to an existing address returns 202 and sends nothing', async () => {
      await makeUser();
      await makeUser('bob@example.com');
      const { token } = await signIn();
      const res = await changeEmail(token, {
        newEmail: ' BOB@example.com ',
        password: PASSWORD,
      }).expect(202);
      expect(res.body).toEqual(accepted);
      await expectNoMail(mail);
      expect(await prisma.emailToken.count()).toBe(0);
    });

    it('change-email to the current address returns 202 and sends nothing', async () => {
      await makeUser();
      const { token } = await signIn();
      const res = await changeEmail(token, {
        newEmail: 'ANA@example.com',
        password: PASSWORD,
      }).expect(202);
      expect(res.body).toEqual(accepted);
      await expectNoMail(mail);
      expect(await prisma.emailToken.count()).toBe(0);
    });
  });

  describe('DELETE /me', () => {
    it('DELETE /me with the wrong password is 400', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      const res = await deleteMe(token, {
        password: 'not the password',
      }).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        code: 'PASSWORD_WRONG',
      });
      await deleteMe(token, {}).expect(400);
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
    });

    it('DELETE /me removes the user and their favorites', async () => {
      const user = await makeUser();
      const other = await makeUser('bob@example.com');
      for (const u of [user, other]) {
        await prisma.favorite.create({
          data: { userId: u.id, tmdbId: 603, mediaType: 'MOVIE' },
        });
      }
      const { token } = await signIn();
      await deleteMe(token, { password: PASSWORD }).expect(204);

      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
      expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(
        await prisma.refreshToken.count({ where: { userId: user.id } }),
      ).toBe(0);
      // Other accounts are untouched.
      expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);
      expect(await prisma.favorite.count({ where: { userId: other.id } })).toBe(
        1,
      );
      await login('ana@example.com').expect(401);
      // The access token outlives the account for its short lifetime but opens nothing.
      await me(token).expect(401);
    });

    it('the only admin DELETE /me is 409 LAST_ADMIN', async () => {
      const admin = await makeUser('admin@example.com', 'ADMIN');
      await makeUser(); // a plain user does not count
      await prisma.user.create({
        data: {
          email: 'blocked-admin@example.com',
          name: 'B',
          passwordHash,
          status: 'BLOCKED',
          role: 'ADMIN',
        },
      }); // nor does a blocked admin
      const { token } = await signIn('admin@example.com');
      const res = await deleteMe(token, { password: PASSWORD }).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, code: 'LAST_ADMIN' });
      expect(await prisma.user.count({ where: { id: admin.id } })).toBe(1);
      // The password is still checked first.
      await deleteMe(token, { password: 'not the password' }).expect(400);
    });

    it('an admin can delete their account when another ACTIVE admin exists', async () => {
      const admin = await makeUser('admin@example.com', 'ADMIN');
      await makeUser('admin2@example.com', 'ADMIN');
      const { token } = await signIn('admin@example.com');
      await deleteMe(token, { password: PASSWORD }).expect(204);
      expect(await prisma.user.count({ where: { id: admin.id } })).toBe(0);
      expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    });

    it('two admins deleting themselves at the same time never leave zero active admins', async () => {
      for (let round = 0; round < 3; round++) {
        await resetDb(prisma);
        await makeUser('a1@example.com', 'ADMIN');
        await makeUser('a2@example.com', 'ADMIN');
        const t1 = await signIn('a1@example.com');
        const t2 = await signIn('a2@example.com');

        const res = await Promise.all([
          deleteMe(t1.token, { password: PASSWORD }),
          deleteMe(t2.token, { password: PASSWORD }),
        ]);
        expect(res.map((r) => r.status).sort()).toEqual([204, 409]);
        expect(
          await prisma.user.count({
            where: { role: 'ADMIN', status: 'ACTIVE' },
          }),
        ).toBe(1);
      }
    });
  });

  describe('account state and races', () => {
    it('a BLOCKED user with a still-valid token (block list not set) is 403 on every password-checked route and nothing changes', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'BLOCKED' },
      });
      const calls = [
        changePassword(token, {
          oldPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
        changeEmail(token, { newEmail: 'new@example.com', password: PASSWORD }),
        deleteMe(token, { password: PASSWORD }),
      ];
      for (const c of calls) {
        const res = await c.expect(403);
        expect(res.body).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_BLOCKED',
        });
      }
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row.passwordHash).toBe(passwordHash);
      expect(row.email).toBe('ana@example.com');
      expect(await prisma.emailToken.count()).toBe(0);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(1); // change-password did not revoke anything
      await expectNoMail(mail);
    });

    it('a PENDING user with a still-valid token is 401 UNAUTHORIZED on the password-checked routes', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'PENDING' },
      });
      const calls = [
        changePassword(token, {
          oldPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
        changeEmail(token, { newEmail: 'new@example.com', password: PASSWORD }),
        deleteMe(token, { password: PASSWORD }),
      ];
      for (const c of calls) {
        const res = await c.expect(401);
        expect((res.body as { code: string }).code).toBe('UNAUTHORIZED');
      }
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
    });

    it('two concurrent change-password calls with the same old password: one 204, one 400 OLD_PASSWORD_WRONG, the winner password survives', async () => {
      await makeUser();
      const a = await signIn();
      const b = await signIn();
      const passwords = [
        'first brand new passphrase',
        'second brand new passphrase',
      ];
      const res = await Promise.all([
        changePassword(a.token, {
          oldPassword: PASSWORD,
          newPassword: passwords[0],
        }),
        changePassword(b.token, {
          oldPassword: PASSWORD,
          newPassword: passwords[1],
        }),
      ]);
      expect(res.map((r) => r.status).sort()).toEqual([204, 400]);
      const loser = res.find((r) => r.status === 400);
      expect((loser?.body as { code: string }).code).toBe('OLD_PASSWORD_WRONG');

      const winner = res.findIndex((r) => r.status === 204);
      const other = 1 - winner;
      await login('ana@example.com', passwords[other]).expect(401);
      await login('ana@example.com', passwords[winner]).expect(200);
    });

    it('a concurrent change-password leaves no live refresh token from before the change', async () => {
      await makeUser();
      const a = await signIn();
      const b = await signIn();
      await Promise.all([
        changePassword(a.token, {
          oldPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
        changePassword(b.token, {
          oldPassword: PASSWORD,
          newPassword: 'another brand new passphrase',
        }),
      ]);
      for (const old of [a.raw, b.raw]) await refresh(old).expect(401);
      expect(
        await prisma.refreshToken.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });
  });

  describe('authentication', () => {
    const routes: [string, string, object?][] = [
      ['get', '/api/v1/me'],
      ['patch', '/api/v1/me', { name: 'Bo' }],
      [
        'post',
        '/api/v1/me/change-password',
        { oldPassword: PASSWORD, newPassword: NEW_PASSWORD },
      ],
      [
        'post',
        '/api/v1/me/change-email',
        { newEmail: 'new@example.com', password: PASSWORD },
      ],
      ['delete', '/api/v1/me', { password: PASSWORD }],
    ];
    const call = (method: string, path: string, body?: object) => {
      const r = (
        http as unknown as Record<string, (p: string) => request.Test>
      )[method](path);
      return body ? r.send(body) : r;
    };

    it('all /me routes without a token are 401', async () => {
      for (const [method, path, body] of routes) {
        const res = await call(method, path, body).expect(401);
        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }
      // A forged token is refused too.
      await http
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });

    it('all /me routes for a user blocked in the cache are 403 ACCOUNT_BLOCKED', async () => {
      const user = await makeUser();
      const { token } = await signIn();
      await blocklist.block(user.id);
      for (const [method, path, body] of routes) {
        const res = await call(method, path, body).set(auth(token)).expect(403);
        expect(res.body).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_BLOCKED',
        });
      }
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
      expect(await prisma.emailToken.count()).toBe(0);
    });
  });
});
