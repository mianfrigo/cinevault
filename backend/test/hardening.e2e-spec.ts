import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { runSeed } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PasswordService } from '../src/auth/password.service';
import { Role, UserStatus } from '../src/generated/prisma/client';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TmdbClient } from '../src/tmdb/tmdb.client';
import { resetDb } from './helpers/db';

const SEED_PASSWORD = 'seed-password-for-tests';
const seedEnv = { SEED_ADMIN_EMAIL: 'admin@example.com' };

/** Builds the real app; env flags are read when the module compiles, then restored. */
async function buildApp(
  flags: Partial<
    Record<
      'THROTTLE_DISABLED' | 'FEATURE_DOWNLOAD_BUTTON' | 'TRUST_PROXY',
      string
    >
  > = {},
): Promise<NestExpressApplication> {
  const set = { THROTTLE_DISABLED: 'false', ...flags };
  const saved = Object.keys(set).map((k) => [k, process.env[k]] as const);
  Object.assign(process.env, set);
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue({ sendMail: () => Promise.resolve() })
      .overrideProvider(TmdbClient)
      .useValue({
        get: () => Promise.resolve({ genres: [{ id: 28, name: 'Action' }] }),
      })
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return app;
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('Hardening (e2e)', () => {
  let app: NestExpressApplication;
  let http: ReturnType<typeof request>;

  const start = async (flags?: Parameters<typeof buildApp>[0]) => {
    app = await buildApp(flags);
    http = request(app.getHttpServer());
  };
  afterEach(async () => {
    await app?.close();
    app = undefined as never;
  });

  describe('GET /config', () => {
    it('GET /config returns downloadButton false by default and true when FEATURE_DOWNLOAD_BUTTON=true', async () => {
      await start();
      const off = await http.get('/api/v1/config').expect(200);
      expect(off.body).toEqual({ features: { downloadButton: false } });
      await app.close();

      await start({ FEATURE_DOWNLOAD_BUTTON: 'true' });
      const on = await http.get('/api/v1/config').expect(200);
      expect(on.body).toEqual({ features: { downloadButton: true } });
    });
  });

  describe('rate limits', () => {
    const body = {
      login: { email: 'a@example.com', password: 'wrong-password' },
      register: {
        name: 'Ana',
        email: 'a@example.com',
        password: 'correct horse battery',
      },
      'forgot-password': { email: 'a@example.com' },
      'resend-verification': { email: 'a@example.com' },
    };

    it('the 6th login attempt within a minute from one IP is 429 with code RATE_LIMITED', async () => {
      await start();
      for (let i = 0; i < 5; i++) {
        await http.post('/api/v1/auth/login').send(body.login).expect(401);
      }
      const res = await http.post('/api/v1/auth/login').send(body.login);
      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests, try again later.',
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('a spoofed X-Forwarded-For does not give a client a fresh limit', async () => {
      await start();
      for (let i = 0; i < 5; i++) {
        await http
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send(body.login)
          .expect(401);
      }
      await http
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '10.0.0.99')
        .send(body.login)
        .expect(429);
    });

    it('with TRUST_PROXY=1 client-supplied X-Forwarded-For entries cannot mint new buckets', async () => {
      await start({ TRUST_PROXY: '1' });
      // The proxy appends the real peer last; everything left of it is client-controlled.
      const login = (i: number) =>
        http
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', `198.51.100.${i}, 203.0.113.9`)
          .send(body.login);
      for (let i = 0; i < 5; i++) await login(i).expect(401);
      await login(99).expect(429);
    });

    it.each(['register', 'forgot-password', 'resend-verification'] as const)(
      'the 6th %s request within a minute is 429',
      async (route) => {
        await start();
        for (let i = 0; i < 5; i++) {
          await http.post(`/api/v1/auth/${route}`).send(body[route]);
        }
        const res = await http.post(`/api/v1/auth/${route}`).send(body[route]);
        expect(res.status).toBe(429);
        expect((res.body as { code: string }).code).toBe('RATE_LIMITED');
      },
    );

    it('health is not rate limited by the auth limit', async () => {
      await start();
      for (let i = 0; i < 150; i++) {
        await http.get('/api/v1/health').expect(200);
      }
    });

    it('other routes are not held to the 5/min auth limit but the whole API is capped at 100/min per IP', async () => {
      await start();
      for (let i = 0; i < 60; i++) {
        await http.get('/api/v1/config').expect(200);
      }
      for (let i = 0; i < 40; i++) {
        await http.get('/api/v1/catalog/genres?type=movie').expect(200);
      }
      // 100 requests over two different routes: the 101st is refused on either.
      const res = await http.get('/api/v1/config');
      expect(res.status).toBe(429);
      expect((res.body as { code: string }).code).toBe('RATE_LIMITED');
    });

    it('THROTTLE_DISABLED=true disables limiting', async () => {
      await start({ THROTTLE_DISABLED: 'true' });
      for (let i = 0; i < 8; i++) {
        await http.post('/api/v1/auth/login').send(body.login).expect(401);
      }
    });
  });

  describe('admin seed', () => {
    let prisma: PrismaService;
    const seed = (extra: Record<string, string | undefined> = {}) =>
      runSeed(
        { ...seedEnv, SEED_ADMIN_PASSWORD: SEED_PASSWORD, ...extra },
        prisma,
      );

    beforeEach(async () => {
      await start({ THROTTLE_DISABLED: 'true' });
      prisma = app.get(PrismaService);
      await resetDb(prisma);
    });

    it('seed creates one admin and running it twice leaves one row', async () => {
      await seed({ SEED_ADMIN_EMAIL: '  Admin@Example.COM ' });
      await seed({ SEED_ADMIN_EMAIL: '  Admin@Example.COM ' });
      const users = await prisma.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: 'admin@example.com',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      });
      expect(users[0].emailVerifiedAt).toBeInstanceOf(Date);
      expect(users[0].passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('the seeded admin can log in with the seed password', async () => {
      await seed();
      const res = await http
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: SEED_PASSWORD })
        .expect(200);
      expect((res.body as { user: { role: string } }).user.role).toBe('ADMIN');
    });

    it('re-running the seed keeps the original password hash and name', async () => {
      await seed();
      await prisma.user.update({
        where: { email: 'admin@example.com' },
        data: { name: 'Renamed' },
      });
      const before = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      await seed({ SEED_ADMIN_PASSWORD: 'a-different-password' });
      const after = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.name).toBe('Renamed');
      expect(after.emailVerifiedAt).toEqual(before.emailVerifiedAt);
    });

    it('seed takes over an unverified pre-registered user: seed password replaces theirs and old tokens are gone', async () => {
      const passwords = app.get(PasswordService);
      const user = await prisma.user.create({
        data: {
          email: 'admin@example.com',
          name: 'Bob',
          passwordHash: await passwords.hash('squatter-password-1'),
          status: UserStatus.PENDING,
        },
      });
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: 'r'.repeat(64),
          expiresAt: new Date(Date.now() + 1e9),
        },
      });
      const mk = (tokenHash: string, usedAt: Date | null) =>
        prisma.emailToken.create({
          data: {
            userId: user.id,
            type: 'VERIFY_EMAIL',
            tokenHash,
            expiresAt: new Date(Date.now() + 1e9),
            usedAt,
          },
        });
      await mk('a'.repeat(64), null);
      await mk('b'.repeat(64), new Date());

      await seed();

      const after = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      expect(after).toMatchObject({
        name: 'Bob',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      });
      expect(after.emailVerifiedAt).toBeInstanceOf(Date);
      await expect(prisma.refreshToken.count()).resolves.toBe(0);
      // Unused tokens are deleted; already-used ones are history and stay.
      await expect(
        prisma.emailToken.findMany({ select: { tokenHash: true } }),
      ).resolves.toEqual([{ tokenHash: 'b'.repeat(64) }]);
      await http
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'squatter-password-1' })
        .expect(401);
      await http
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: SEED_PASSWORD })
        .expect(200);

      // Now verified: a second run with another password changes nothing.
      await seed({ SEED_ADMIN_PASSWORD: 'a-different-password' });
      const again = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      expect(again.passwordHash).toBe(after.passwordHash);
      expect(again.emailVerifiedAt).toEqual(after.emailVerifiedAt);
    });

    it('seed promotes a verified existing user keeping its password, name and verification date', async () => {
      const passwordHash = await app
        .get(PasswordService)
        .hash('old-password-1');
      const verifiedAt = new Date('2024-01-02T03:04:05.000Z');
      await prisma.user.create({
        data: {
          email: 'admin@example.com',
          name: 'Bob',
          passwordHash,
          status: UserStatus.BLOCKED,
          emailVerifiedAt: verifiedAt,
        },
      });
      await seed();
      const after = await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      });
      expect(after).toMatchObject({
        name: 'Bob',
        passwordHash,
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      });
      expect(after.emailVerifiedAt).toEqual(verifiedAt);
      await http
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'old-password-1' })
        .expect(200);
    });

    it('seed rejects missing or invalid input without echoing the password', async () => {
      await expect(seed({ SEED_ADMIN_EMAIL: undefined })).rejects.toThrow(
        /SEED_ADMIN_EMAIL/,
      );
      await expect(seed({ SEED_ADMIN_PASSWORD: undefined })).rejects.toThrow(
        /SEED_ADMIN_PASSWORD/,
      );
      const short = 'short-pw';
      const err = await seed({ SEED_ADMIN_PASSWORD: short }).catch(
        (e: Error) => e,
      );
      expect((err as Error).message).toMatch(/10 to 128/);
      expect((err as Error).message).not.toContain(short);
      await expect(
        seed({ SEED_ADMIN_PASSWORD: 'x'.repeat(129) }),
      ).rejects.toThrow(/10 to 128/);
      await expect(prisma.user.count()).resolves.toBe(0);
    });
  });

  describe('seed script', () => {
    it('exits non-zero with a clear message when env vars are missing and never prints the password', () => {
      const secret = 'sentinel-password-do-not-print';
      const run = spawnSync(
        process.execPath,
        [require.resolve('tsx/cli'), 'prisma/seed.ts'],
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf8',
          // Blank wins over a backend/.env the developer may have (real env is never overridden).
          env: {
            ...process.env,
            SEED_ADMIN_EMAIL: '',
            SEED_ADMIN_PASSWORD: secret,
          },
        },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('SEED_ADMIN_EMAIL');
      expect(run.stdout + run.stderr).not.toContain(secret);
    }, 60_000);
  });
});
