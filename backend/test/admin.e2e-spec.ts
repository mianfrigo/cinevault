import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AdminService } from '../src/admin/admin.service';
import { BlockListService } from '../src/auth/blocklist.service';
import { PasswordService } from '../src/auth/password.service';
import type { Role, UserStatus } from '../src/generated/prisma/client';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';
import { flushTestRedis, redisPttl } from './helpers/redis';

const PASSWORD = 'correct horse battery';
const UUID = '00000000-0000-4000-8000-000000000000';
const DAY = 24 * 60 * 60 * 1000;
const rawOf = (setCookie: string) =>
  /^cv_refresh=([\w-]*)/.exec(setCookie)?.[1] as string;

interface UserBody {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}
interface PageBody {
  items: UserBody[];
  page: number;
  totalPages: number;
  totalItems: number;
}

describe('Admin endpoints (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let passwordHash: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue({ sendMail: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    passwordHash = await app.get(PasswordService).hash(PASSWORD);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await flushTestRedis();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const makeUser = (
    email: string,
    o: {
      role?: Role;
      status?: UserStatus;
      name?: string;
      createdAt?: Date;
    } = {},
  ) =>
    prisma.user.create({
      data: {
        email,
        // Only a PENDING account has never verified its email.
        emailVerifiedAt: o.status === 'PENDING' ? null : new Date(),
        name: o.name ?? 'Ana',
        passwordHash,
        role: o.role ?? 'USER',
        status: o.status ?? 'ACTIVE',
        ...(o.createdAt && { createdAt: o.createdAt }),
      },
    });

  const login = (email: string) =>
    http.post('/api/v1/auth/login').send({ email, password: PASSWORD });

  async function signIn(email: string) {
    const res = await login(email).expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    return {
      token: (res.body as { accessToken: string }).accessToken,
      raw: rawOf(cookie),
    };
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (t: string, query = '') =>
    http.get(`/api/v1/admin/users${query}`).set(auth(t));
  const patch = (t: string, id: string, body: unknown) =>
    http
      .patch(`/api/v1/admin/users/${id}`)
      .set(auth(t))
      .send(body as object);
  const del = (t: string, id: string) =>
    http.delete(`/api/v1/admin/users/${id}`).set(auth(t));
  const overview = (t: string) =>
    http.get('/api/v1/admin/overview').set(auth(t));
  const me = (t: string) => http.get('/api/v1/me').set(auth(t));
  const refresh = (raw: string) =>
    http
      .post('/api/v1/auth/refresh')
      .set('Cookie', `cv_refresh=${raw}`)
      .send({});

  /** An ACTIVE admin with a live access token. */
  async function admin(email = 'admin@example.com') {
    const user = await makeUser(email, { role: 'ADMIN', name: 'Admin' });
    return { user, ...(await signIn(email)) };
  }

  describe('access control', () => {
    it('USER token on any admin route is 403, no token is 401', async () => {
      await makeUser('ana@example.com');
      const { token } = await signIn('ana@example.com');
      const routes: [string, string][] = [
        ['get', '/api/v1/admin/users'],
        ['patch', `/api/v1/admin/users/${UUID}`],
        ['delete', `/api/v1/admin/users/${UUID}`],
        ['get', '/api/v1/admin/overview'],
      ];
      for (const [method, url] of routes) {
        const call = () =>
          (http as unknown as Record<string, (u: string) => request.Test>)[
            method
          ](url);
        await call().expect(401);
        const res = await call().set(auth(token)).send({}).expect(403);
        expect(res.body).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      }
    });

    it('an admin demoted in the DB (token still says ADMIN) gets 403 on PATCH and DELETE', async () => {
      const a = await admin();
      await makeUser('root@example.com', { role: 'ADMIN' });
      const target = await makeUser('ana@example.com');
      await prisma.user.update({
        where: { id: a.user.id },
        data: { role: 'USER' },
      });
      for (const call of [
        () => patch(a.token, target.id, { status: 'BLOCKED' }),
        () => del(a.token, target.id),
      ]) {
        const res = await call().expect(403);
        expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
      }
      expect(
        await prisma.user.findUnique({ where: { id: target.id } }),
      ).toMatchObject({ status: 'ACTIVE' });
    });

    it('a demoted or deleted admin (token still says ADMIN) gets 403 on both GETs, a current admin 200', async () => {
      const a = await admin();
      const gone = await admin('gone@example.com');
      await list(a.token).expect(200);
      await overview(a.token).expect(200);
      await prisma.user.update({
        where: { id: a.user.id },
        data: { role: 'USER' },
      });
      await prisma.user.delete({ where: { id: gone.user.id } });
      for (const t of [a.token, gone.token]) {
        for (const call of [() => list(t), () => overview(t)]) {
          const res = await call().expect(403);
          expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
        }
      }
      const root = await admin('root@example.com');
      await list(root.token).expect(200);
      await overview(root.token).expect(200);
    });

    it('an admin blocked in the DB (token and block list unaware) gets 403 on PATCH and DELETE', async () => {
      const a = await admin();
      await makeUser('root@example.com', { role: 'ADMIN' });
      const target = await makeUser('ana@example.com');
      await prisma.user.update({
        where: { id: a.user.id },
        data: { status: 'BLOCKED' },
      });
      await patch(a.token, target.id, { role: 'ADMIN' }).expect(403);
      await del(a.token, target.id).expect(403);
      expect(
        await prisma.user.findUnique({ where: { id: target.id } }),
      ).toMatchObject({ role: 'USER' });
    });
  });

  describe('GET /admin/users', () => {
    it('list is paginated 20 per page, newest first, and q filters by name and by email in any case', async () => {
      const a = await admin();
      const base = Date.now() - 10 * DAY;
      for (let i = 0; i < 25; i++) {
        await makeUser(`u${i}@example.com`, {
          name: i === 3 ? 'Zelda Quest' : `User ${i}`,
          createdAt: new Date(base + i * 1000),
        });
      }
      await prisma.user.update({
        where: { id: a.user.id },
        data: { createdAt: new Date(base - 1000) },
      });

      const p1 = (await list(a.token).expect(200)).body as PageBody;
      expect(p1).toMatchObject({ page: 1, totalPages: 2, totalItems: 26 });
      expect(p1.items).toHaveLength(20);
      expect(p1.items[0].email).toBe('u24@example.com');
      expect(p1.items[19].email).toBe('u5@example.com');
      const p2 = (await list(a.token, '?page=2').expect(200)).body as PageBody;
      expect(p2.items.map((u) => u.email)).toEqual([
        'u4@example.com',
        'u3@example.com',
        'u2@example.com',
        'u1@example.com',
        'u0@example.com',
        'admin@example.com',
      ]);
      expect(
        ((await list(a.token, '?page=3').expect(200)).body as PageBody).items,
      ).toEqual([]);

      const byName = (await list(a.token, '?q=zELDA').expect(200))
        .body as PageBody;
      expect(byName.items.map((u) => u.email)).toEqual(['u3@example.com']);
      const byEmail = (await list(a.token, '?q=U12@EXAMPLE').expect(200))
        .body as PageBody;
      expect(byEmail.items.map((u) => u.email)).toEqual(['u12@example.com']);
      // Trimmed; blank means no filter.
      const trimmed = (await list(a.token, '?q=%20zelda%20').expect(200))
        .body as PageBody;
      expect(trimmed.totalItems).toBe(1);
      const blank = (await list(a.token, '?q=%20%20').expect(200))
        .body as PageBody;
      expect(blank.totalItems).toBe(26);
      const none = (await list(a.token, '?q=nobody').expect(200))
        .body as PageBody;
      expect(none).toMatchObject({ items: [], totalItems: 0 });
    });

    it('ties on createdAt are ordered by id descending', async () => {
      const a = await admin();
      const at = new Date(Date.now() - DAY);
      const ids = (
        await Promise.all(
          ['a', 'b', 'c', 'd'].map((n) =>
            makeUser(`${n}@example.com`, { createdAt: at }),
          ),
        )
      ).map((u) => u.id);
      const body = (await list(a.token).expect(200)).body as PageBody;
      expect(body.items.slice(1).map((u) => u.id)).toEqual(
        [...ids].sort().reverse(),
      );
    });

    it('% and _ in q match literally', async () => {
      const a = await admin();
      await makeUser('p@example.com', { name: '100% Real' });
      await makeUser('q@example.com', { name: 'a_b' });
      await makeUser('r@example.com', { name: 'axb' });
      const names = async (q: string) =>
        (
          (await list(a.token, `?q=${encodeURIComponent(q)}`).expect(200))
            .body as PageBody
        ).items.map((u) => u.name);
      expect(await names('%')).toEqual(['100% Real']);
      expect(await names('_')).toEqual(['a_b']);
      expect(await names('a_b')).toEqual(['a_b']);
      expect(await names('\\')).toEqual([]);
    });

    it('rejects q over 100 chars, page 0 and page 501', async () => {
      const a = await admin();
      await list(a.token, `?q=${'x'.repeat(101)}`).expect(400);
      await list(a.token, `?q=${'x'.repeat(100)}`).expect(200);
      await list(a.token, '?q=a&q=b').expect(400);
      await list(a.token, '?page=0').expect(400);
      await list(a.token, '?page=501').expect(400);
      await list(a.token, '?page=1.5').expect(400);
      const res = await list(a.token, '?page=abc').expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('never exposes passwordHash', async () => {
      const a = await admin();
      const res = await list(a.token).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });
  });

  describe('PATCH /admin/users/:id', () => {
    it('admin can promote a user to ADMIN and block then unblock a user', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      const promoted = await patch(a.token, ana.id, { role: 'ADMIN' }).expect(
        200,
      );
      expect(promoted.body).toEqual({
        id: ana.id,
        email: 'ana@example.com',
        name: 'Ana',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: ana.createdAt.toISOString(),
      });
      expect(JSON.stringify(promoted.body)).not.toMatch(/passwordHash|argon2/);
      // And back (a second admin exists, so this is fine).
      await patch(a.token, ana.id, { role: 'USER' }).expect(200);

      const blocked = await patch(a.token, ana.id, {
        status: 'BLOCKED',
      }).expect(200);
      expect(blocked.body).toMatchObject({ status: 'BLOCKED', role: 'USER' });
      await login('ana@example.com').expect(403);
      const unblocked = await patch(a.token, ana.id, {
        status: 'ACTIVE',
      }).expect(200);
      expect(unblocked.body).toMatchObject({ status: 'ACTIVE' });
      expect(
        (await prisma.user.findUnique({ where: { id: ana.id } }))?.status,
      ).toBe('ACTIVE');
    });

    it("blocking revokes the target's refresh tokens and their next guarded request is 403 ACCOUNT_BLOCKED", async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      const s1 = await signIn('ana@example.com');
      const s2 = await signIn('ana@example.com');
      await me(s1.token).expect(200);

      await patch(a.token, ana.id, { status: 'BLOCKED' }).expect(200);

      expect(
        await prisma.refreshToken.count({
          where: { userId: ana.id, revokedAt: null },
        }),
      ).toBe(0);
      const ttl = await redisPttl(`blocked:${ana.id}`);
      expect(ttl).toBeGreaterThan(590_000);
      expect(ttl).toBeLessThanOrEqual(600_000);
      const res = await me(s1.token).expect(403);
      expect(res.body).toMatchObject({ code: 'ACCOUNT_BLOCKED' });
      for (const s of [s1, s2]) {
        const r = await refresh(s.raw).expect(401);
        expect(r.body).toMatchObject({ code: 'REFRESH_INVALID' });
      }
    });

    it('unblocking restores access', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      const s = await signIn('ana@example.com');
      await patch(a.token, ana.id, { status: 'BLOCKED' }).expect(200);
      await me(s.token).expect(403);

      await patch(a.token, ana.id, { status: 'ACTIVE' }).expect(200);
      expect(await redisPttl(`blocked:${ana.id}`)).toBe(-2);
      await me(s.token).expect(200);
      const again = await signIn('ana@example.com');
      await me(again.token).expect(200);
    });

    it('blocking then unblocking a PENDING user leaves them PENDING (still cannot log in)', async () => {
      const a = await admin();
      const pending = await makeUser('p@example.com', { status: 'PENDING' });
      const blocked = await patch(a.token, pending.id, {
        status: 'BLOCKED',
      }).expect(200);
      expect(blocked.body).toMatchObject({ status: 'BLOCKED' });
      const unblocked = await patch(a.token, pending.id, {
        status: 'ACTIVE',
      }).expect(200);
      expect(unblocked.body).toMatchObject({ status: 'PENDING' });
      expect(
        await prisma.user.findUnique({ where: { id: pending.id } }),
      ).toMatchObject({ status: 'PENDING', emailVerifiedAt: null });
      const res = await login('p@example.com').expect(403);
      expect(res.body).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
      expect(await redisPttl(`blocked:${pending.id}`)).toBe(-2);
    });

    it('blocking then unblocking a verified user returns them to ACTIVE and login works', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      await patch(a.token, ana.id, { status: 'BLOCKED' }).expect(200);
      const res = await patch(a.token, ana.id, { status: 'ACTIVE' }).expect(
        200,
      );
      expect(res.body).toMatchObject({ status: 'ACTIVE' });
      await login('ana@example.com').expect(200);
    });

    it('promoting a PENDING or a BLOCKED user to ADMIN is 400', async () => {
      const a = await admin();
      const pending = await makeUser('p@example.com', { status: 'PENDING' });
      const blocked = await makeUser('b@example.com', { status: 'BLOCKED' });
      for (const id of [pending.id, blocked.id]) {
        const res = await patch(a.token, id, { role: 'ADMIN' }).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    });

    it('rejects an empty patch, unknown keys and invalid values with 400 VALIDATION_ERROR', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      for (const body of [
        {},
        { role: null },
        { role: 'SUPERUSER' },
        { role: 'user' },
        { status: 'PENDING' },
        { status: 'DELETED' },
        { status: 1 },
        { name: 'x' },
        { role: 'ADMIN', email: 'x@example.com' },
      ]) {
        const res = await patch(a.token, ana.id, body).expect(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      expect(
        await prisma.user.findUnique({ where: { id: ana.id } }),
      ).toMatchObject({ role: 'USER', status: 'ACTIVE' });
    });

    it('rejects no-op changes and force-activating a PENDING user with 400', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      const pending = await makeUser('pending@example.com', {
        status: 'PENDING',
      });
      await patch(a.token, ana.id, { role: 'USER' }).expect(400);
      await patch(a.token, ana.id, { status: 'ACTIVE' }).expect(400);
      const res = await patch(a.token, pending.id, {
        status: 'ACTIVE',
      }).expect(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      await patch(a.token, ana.id, { status: 'BLOCKED' }).expect(200);
      await patch(a.token, ana.id, { status: 'BLOCKED' }).expect(400);
      expect(
        (await prisma.user.findUnique({ where: { id: pending.id } }))?.status,
      ).toBe('PENDING');
    });

    it('unknown id is 404 NOT_FOUND and a non-UUID id is 400', async () => {
      const a = await admin();
      const res = await patch(a.token, UUID, { role: 'ADMIN' }).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      await del(a.token, UUID).expect(404);
      const bad = await patch(a.token, 'not-a-uuid', { role: 'ADMIN' }).expect(
        400,
      );
      expect(bad.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      await del(a.token, 'not-a-uuid').expect(400);
    });
  });

  describe('self action and last admin', () => {
    it('self patch and self delete are 409 SELF_ACTION', async () => {
      const a = await admin();
      await makeUser('root@example.com', { role: 'ADMIN' });
      // Even values that would be harmless go through the self check first.
      for (const body of [
        { role: 'ADMIN' },
        { role: 'USER' },
        { status: 'BLOCKED' },
      ]) {
        const res = await patch(a.token, a.user.id, body).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          code: 'SELF_ACTION',
        });
      }
      const res = await del(a.token, a.user.id).expect(409);
      expect(res.body).toMatchObject({ code: 'SELF_ACTION' });
      expect(
        await prisma.user.findUnique({ where: { id: a.user.id } }),
      ).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    });

    it('demoting or blocking or deleting the only active admin is 409 LAST_ADMIN, but works when a second admin exists', async () => {
      const a = await admin();
      const root = await makeUser('root@example.com', { role: 'ADMIN' });
      // A blocked admin and a plain user are not active admins.
      await makeUser('old@example.com', { role: 'ADMIN', status: 'BLOCKED' });
      await makeUser('ana@example.com');

      // Two active admins: demoting and blocking the other one works.
      await patch(a.token, root.id, { role: 'USER' }).expect(200);
      await prisma.user.update({
        where: { id: root.id },
        data: { role: 'ADMIN' },
      });
      await patch(a.token, root.id, { status: 'BLOCKED' }).expect(200);
      await prisma.user.update({
        where: { id: root.id },
        data: { status: 'ACTIVE' },
      });

      // `a` loses ADMIN in the DB while its token still says ADMIN: root is now
      // the only active admin, and nothing may touch it.
      await prisma.user.update({
        where: { id: a.user.id },
        data: { role: 'USER' },
      });
      for (const call of [
        () => patch(a.token, root.id, { role: 'USER' }),
        () => patch(a.token, root.id, { status: 'BLOCKED' }),
        () => patch(a.token, root.id, { role: 'USER', status: 'BLOCKED' }),
        () => del(a.token, root.id),
      ]) {
        const res = await call().expect(409);
        expect(res.body).toMatchObject({ statusCode: 409, code: 'LAST_ADMIN' });
      }
      expect(
        await prisma.user.findUnique({ where: { id: root.id } }),
      ).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
    });

    it('deleting an admin works when another ACTIVE admin exists', async () => {
      const a = await admin();
      const other = await makeUser('root@example.com', { role: 'ADMIN' });
      await del(a.token, other.id).expect(204);
      expect(await prisma.user.count({ where: { id: other.id } })).toBe(0);
    });

    it('two admins blocking or demoting each other at once leave an active admin', async () => {
      for (const body of [{ status: 'BLOCKED' }, { role: 'USER' }]) {
        for (let round = 0; round < 3; round++) {
          await resetDb(prisma);
          const a = await admin('a@example.com');
          const b = await admin('b@example.com');
          const results = await Promise.all([
            patch(a.token, b.user.id, body),
            patch(b.token, a.user.id, body),
          ]);
          const codes = results.map((r) => r.status).sort();
          expect(codes).toEqual([200, 409]);
          expect(results.find((r) => r.status === 409)?.body).toMatchObject({
            code: 'LAST_ADMIN',
          });
          expect(
            await prisma.user.count({
              where: { role: 'ADMIN', status: 'ACTIVE' },
            }),
          ).toBe(1);
        }
      }
    });

    it('two admins deleting each other at once leave an active admin', async () => {
      for (let round = 0; round < 3; round++) {
        await resetDb(prisma);
        const a = await admin('a@example.com');
        const b = await admin('b@example.com');
        const results = await Promise.all([
          del(a.token, b.user.id),
          del(b.token, a.user.id),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
        expect(
          await prisma.user.count({
            where: { role: 'ADMIN', status: 'ACTIVE' },
          }),
        ).toBe(1);
      }
    });
  });

  describe('block list reconcile', () => {
    it('the block list is rewritten from the DB status, whatever the request intended', async () => {
      const ana = await makeUser('ana@example.com');
      const svc = app.get(AdminService);
      const blocklist = app.get(BlockListService);
      // DB says BLOCKED but the cache lost the key (a concurrent unblock wrote last).
      await prisma.user.update({
        where: { id: ana.id },
        data: { status: 'BLOCKED' },
      });
      await blocklist.unblock(ana.id);
      await svc.syncBlockList(ana.id);
      expect(await redisPttl(`blocked:${ana.id}`)).toBeGreaterThan(0);
      // DB says ACTIVE but a stale key is left behind.
      await prisma.user.update({
        where: { id: ana.id },
        data: { status: 'ACTIVE' },
      });
      await svc.syncBlockList(ana.id);
      expect(await redisPttl(`blocked:${ana.id}`)).toBe(-2);
    });
  });

  describe('DELETE /admin/users/:id', () => {
    it('delete removes the user and cascades', async () => {
      const a = await admin();
      const ana = await makeUser('ana@example.com');
      const other = await makeUser('bob@example.com');
      const s = await signIn('ana@example.com');
      await prisma.favorite.create({
        data: { userId: ana.id, mediaType: 'MOVIE', tmdbId: 603 },
      });

      await del(a.token, ana.id).expect(204);

      expect(await prisma.user.count({ where: { id: ana.id } })).toBe(0);
      expect(
        await prisma.refreshToken.count({ where: { userId: ana.id } }),
      ).toBe(0);
      expect(await prisma.favorite.count({ where: { userId: ana.id } })).toBe(
        0,
      );
      expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);
      await login('ana@example.com').expect(401);
      await me(s.token).expect(401);
      await del(a.token, ana.id).expect(404);
    });

    it('deletes a blocked or pending user', async () => {
      const a = await admin();
      const blocked = await makeUser('b@example.com', { status: 'BLOCKED' });
      const pending = await makeUser('p@example.com', { status: 'PENDING' });
      await del(a.token, blocked.id).expect(204);
      await del(a.token, pending.id).expect(204);
    });
  });

  describe('GET /admin/overview', () => {
    it('overview returns totalUsers, newThisWeek (a user created 8 days ago is not counted) and 5 recent signups', async () => {
      const a = await admin();
      const now = Date.now();
      await prisma.user.update({
        where: { id: a.user.id },
        data: { createdAt: new Date(now - 30 * DAY) },
      });
      await makeUser('old@example.com', { createdAt: new Date(now - 8 * DAY) });
      for (let i = 1; i <= 6; i++) {
        await makeUser(`n${i}@example.com`, {
          createdAt: new Date(now - i * 60_000),
        });
      }
      const res = await overview(a.token).expect(200);
      const body = res.body as {
        totalUsers: number;
        newThisWeek: number;
        recentSignups: UserBody[];
      };
      expect(body.totalUsers).toBe(8);
      expect(body.newThisWeek).toBe(6);
      expect(body.recentSignups.map((u) => u.email)).toEqual([
        'n1@example.com',
        'n2@example.com',
        'n3@example.com',
        'n4@example.com',
        'n5@example.com',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });
  });
});
