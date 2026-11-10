import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Cache } from 'cache-manager';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BlockListService } from '../src/auth/blocklist.service';
import { PasswordService } from '../src/auth/password.service';
import { AppException } from '../src/common/app.exception';
import { PrismaService } from '../src/prisma/prisma.service';
import { TmdbClient } from '../src/tmdb/tmdb.client';
import { resetDb } from './helpers/db';
import { flushTestRedis } from './helpers/redis';

const fx = (name: string) =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', 'src', 'tmdb', '__fixtures__', name),
      'utf8',
    ),
  ) as object;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serves a detail for any `/movie/<n>` or `/tv/<n>` unless listed in `missing`. */
class FakeTmdb {
  calls: string[] = [];
  missing = new Set<string>();
  failWith?: AppException;
  delay: (id: number) => number = () => 10;
  inFlight = 0;
  maxInFlight = 0;

  async get(path: string) {
    this.calls.push(path);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const m = /^\/(movie|tv)\/(\d+)$/.exec(path);
      await sleep(this.delay(Number(m?.[2])));
      if (this.failWith) throw this.failWith;
      if (!m || this.missing.has(path)) {
        throw new AppException(404, 'NOT_FOUND', 'Title not found');
      }
      return {
        ...fx(m[1] === 'movie' ? 'movie-detail.json' : 'tv-detail.json'),
        id: Number(m[2]),
        title: `Title ${m[2]}`,
        name: `Title ${m[2]}`,
      };
    } finally {
      this.inFlight--;
    }
  }
}

const PASSWORD = 'correct horse battery';
const BASE = '/api/v1/me/favorites';

describe('Favorites (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let blocklist: BlockListService;
  let passwordHash: string;
  const tmdb = new FakeTmdb();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TmdbClient)
      .useValue(tmdb)
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
    // Both tiers: Redis and the in-process fallback store.
    await flushTestRedis();
    await app.get<Cache>(CACHE_MANAGER).clear();
    Object.assign(tmdb, new FakeTmdb());
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const makeUser = (email = 'ana@example.com') =>
    prisma.user.create({
      data: { email, name: 'Ana', passwordHash, status: 'ACTIVE' },
    });

  /** Creates the user, signs in through the real endpoint, returns the token. */
  async function signUp(email = 'ana@example.com') {
    const user = await makeUser(email);
    const res = await http
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { user, token: (res.body as { accessToken: string }).accessToken };
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const put = (t: string, path: string) =>
    http.put(`${BASE}/${path}`).set(auth(t));
  const del = (t: string, path: string) =>
    http.delete(`${BASE}/${path}`).set(auth(t));
  const list = (t: string, qs = '') => http.get(`${BASE}${qs}`).set(auth(t));
  const ids = (t: string) => http.get(`${BASE}/ids`).set(auth(t));

  /** Direct rows, `i` minutes old (smaller i = newer). */
  const seed = (
    userId: string,
    rows: { id: number; type?: 'MOVIE' | 'TV'; ageMin?: number }[],
  ) =>
    prisma.favorite.createMany({
      data: rows.map((r) => ({
        userId,
        tmdbId: r.id,
        mediaType: r.type ?? 'MOVIE',
        createdAt: new Date(Date.now() - (r.ageMin ?? 0) * 60_000),
      })),
    });

  const items = (res: { body: unknown }) =>
    (res.body as { items: Record<string, unknown>[] }).items;

  it('PUT is idempotent (two calls, one row)', async () => {
    const { user, token } = await signUp();
    await put(token, 'movie/603').expect(204);
    const first = await prisma.favorite.findFirstOrThrow();
    await put(token, 'movie/603').expect(204);
    expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(1);
    // The second call keeps the original row, so "newest first" is not reshuffled.
    expect((await prisma.favorite.findFirstOrThrow()).createdAt).toEqual(
      first.createdAt,
    );
    // The same id as a series is a different favorite.
    await put(token, 'tv/603').expect(204);
    expect(await prisma.favorite.count()).toBe(2);
  });

  it('PUT with an id unknown to TMDB still succeeds and makes no TMDB call', async () => {
    const { token } = await signUp();
    tmdb.missing.add('/movie/999999');
    await put(token, 'movie/999999').expect(204);
    expect(await prisma.favorite.count()).toBe(1);
    expect(tmdb.calls).toHaveLength(0);
  });

  it('DELETE of a missing favorite is 204', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [{ id: 1 }]);
    await del(token, 'movie/603').expect(204);
    await del(token, 'movie/603').expect(204);
    expect(await prisma.favorite.count()).toBe(1);
    await del(token, 'movie/1').expect(204);
    await del(token, 'movie/1').expect(204);
    expect(await prisma.favorite.count()).toBe(0);
  });

  it('list is newest first and filtered by type', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [
      { id: 1, ageMin: 30 },
      { id: 2, type: 'TV', ageMin: 20 },
      { id: 3, ageMin: 10 },
      { id: 4, type: 'TV', ageMin: 5 },
    ]);
    const all = await list(token).expect(200);
    expect(
      items(all).map((i) => `${String(i.mediaType)}:${String(i.tmdbId)}`),
    ).toEqual(['tv:4', 'movie:3', 'tv:2', 'movie:1']);
    const movies = await list(token, '?type=movie').expect(200);
    expect(items(movies).map((i) => i.tmdbId)).toEqual([3, 1]);
    expect(movies.body).toMatchObject({ totalItems: 2, totalPages: 1 });
    const tv = await list(token, '?type=tv').expect(200);
    expect(items(tv).map((i) => i.tmdbId)).toEqual([4, 2]);
  });

  it('list items are summaries with addedAt, card-size posters and no unavailable key', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [{ id: 603 }]);
    const [item] = items(await list(token).expect(200));
    const row = await prisma.favorite.findFirstOrThrow();
    expect(item).toEqual({
      tmdbId: 603,
      mediaType: 'movie',
      title: 'Title 603',
      year: expect.any(Number) as unknown,
      rating: expect.any(Number) as unknown,
      posterUrl: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
      backdropUrl: expect.stringContaining('/w1280/') as unknown,
      overview: expect.any(String) as unknown,
      addedAt: row.createdAt.toISOString(),
    });
    expect(item).not.toHaveProperty('unavailable');
  });

  it('list pagination returns 20 per page with totalItems', async () => {
    const { token, user } = await signUp();
    await seed(
      user.id,
      Array.from({ length: 25 }, (_, i) => ({ id: 100 + i, ageMin: 25 - i })),
    );
    const p1 = await list(token).expect(200);
    expect(p1.body).toMatchObject({ page: 1, totalPages: 2, totalItems: 25 });
    expect(items(p1)).toHaveLength(20);
    expect(items(p1)[0].tmdbId).toBe(124); // newest
    const p2 = await list(token, '?page=2').expect(200);
    expect(p2.body).toMatchObject({ page: 2, totalPages: 2, totalItems: 25 });
    expect(items(p2).map((i) => i.tmdbId)).toEqual([104, 103, 102, 101, 100]);
    const p3 = await list(token, '?page=3').expect(200);
    expect(items(p3)).toEqual([]);
    expect(p3.body).toMatchObject({ page: 3, totalItems: 25 });
  });

  it('an empty list is a normal page', async () => {
    const { token } = await signUp();
    const res = await list(token).expect(200);
    expect(res.body).toEqual({
      items: [],
      page: 1,
      totalPages: 0,
      totalItems: 0,
    });
    expect(tmdb.calls).toHaveLength(0);
  });

  it('list keeps DB order although the details arrive out of order', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [
      { id: 1, ageMin: 3 },
      { id: 2, ageMin: 2 },
      { id: 3, ageMin: 1 },
    ]);
    tmdb.delay = (id) => (id === 3 ? 80 : id === 2 ? 40 : 1);
    const res = await list(token).expect(200);
    expect(items(res).map((i) => i.tmdbId)).toEqual([3, 2, 1]);
  });

  it('list never has more than 5 TMDB requests in flight and reuses cached details', async () => {
    const { token, user } = await signUp();
    await seed(
      user.id,
      Array.from({ length: 20 }, (_, i) => ({ id: 500 + i, ageMin: i })),
    );
    await list(token).expect(200);
    expect(tmdb.calls).toHaveLength(20);
    expect(tmdb.maxInFlight).toBeGreaterThan(1);
    expect(tmdb.maxInFlight).toBeLessThanOrEqual(5);
    await list(token).expect(200);
    expect(tmdb.calls).toHaveLength(20);
  });

  it('a favorite whose TMDB title 404s appears with unavailable true and the request is 200', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [
      { id: 7, ageMin: 2 },
      { id: 8, type: 'TV', ageMin: 1 },
    ]);
    tmdb.missing.add('/tv/8');
    const res = await list(token).expect(200);
    const row = await prisma.favorite.findFirstOrThrow({
      where: { tmdbId: 8 },
    });
    expect(items(res)).toEqual([
      {
        tmdbId: 8,
        mediaType: 'tv',
        title: 'Unavailable title',
        year: null,
        rating: null,
        posterUrl: null,
        backdropUrl: null,
        overview: null,
        addedAt: row.createdAt.toISOString(),
        unavailable: true,
      },
      expect.objectContaining({ tmdbId: 7, title: 'Title 7' }),
    ]);
    expect(items(res)[1]).not.toHaveProperty('unavailable');
  });

  it('list returns 502 TMDB_UNAVAILABLE when the fake client throws it', async () => {
    const { token, user } = await signUp();
    await seed(user.id, [{ id: 1 }, { id: 2 }]);
    tmdb.failWith = new AppException(502, 'TMDB_UNAVAILABLE', 'down');
    const res = await list(token).expect(502);
    expect(res.body).toMatchObject({
      statusCode: 502,
      code: 'TMDB_UNAVAILABLE',
    });
    // The ids endpoint needs no TMDB.
    await ids(token).expect(200);
  });

  it('ids returns all pairs', async () => {
    const { token, user } = await signUp();
    await seed(
      user.id,
      Array.from({ length: 22 }, (_, i) => ({
        id: i + 1,
        type: i % 2 ? ('TV' as const) : ('MOVIE' as const),
        ageMin: i,
      })),
    );
    const res = await ids(token).expect(200);
    const body = res.body as { mediaType: string; tmdbId: number }[];
    expect(body).toHaveLength(22);
    expect(body).toContainEqual({ mediaType: 'movie', tmdbId: 1 });
    expect(body).toContainEqual({ mediaType: 'tv', tmdbId: 2 });
    expect(Object.keys(body[0]).sort()).toEqual(['mediaType', 'tmdbId']);
    expect(tmdb.calls).toHaveLength(0);
  });

  it('users only see their own favorites', async () => {
    const a = await signUp();
    const b = await signUp('bob@example.com');
    await put(a.token, 'movie/1').expect(204);
    await put(b.token, 'movie/2').expect(204);
    expect(items(await list(a.token).expect(200)).map((i) => i.tmdbId)).toEqual(
      [1],
    );
    expect((await ids(b.token).expect(200)).body).toEqual([
      { mediaType: 'movie', tmdbId: 2 },
    ]);
    // Deleting B's pair as A removes nothing.
    await del(a.token, 'movie/2').expect(204);
    expect(await prisma.favorite.count({ where: { userId: b.user.id } })).toBe(
      1,
    );
  });

  it('invalid type or tmdbId 0 is 400', async () => {
    const { token } = await signUp();
    const bad = [
      'person/603',
      'movies/603',
      'movie/0',
      'movie/-1',
      'movie/abc',
      'movie/1.5',
      'movie/2147483648',
    ];
    for (const p of bad) {
      for (const call of [put, del]) {
        const res = await call(token, p).expect(400);
        expect(res.body).toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        });
      }
    }
    await put(token, 'movie/2147483647').expect(204);
    expect(await prisma.favorite.count()).toBe(1);
  });

  it('list rejects an invalid type and page outside 1..500 with 400', async () => {
    const { token } = await signUp();
    for (const qs of [
      '?type=person',
      '?type=',
      '?page=0',
      '?page=501',
      '?page=abc',
      '?page=1.5',
    ]) {
      const res = await list(token, qs).expect(400);
      expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
    }
    await list(token, '?page=500').expect(200);
    await list(token, '?type=tv&page=1').expect(200);
  });

  describe('authentication', () => {
    const routes: [string, string][] = [
      ['get', BASE],
      ['get', `${BASE}/ids`],
      ['put', `${BASE}/movie/603`],
      ['delete', `${BASE}/movie/603`],
    ];
    const call = (method: string, path: string) =>
      (http as unknown as Record<string, (p: string) => request.Test>)[method](
        path,
      );

    it('no token is 401', async () => {
      for (const [method, path] of routes) {
        const res = await call(method, path).expect(401);
        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }
    });

    it('a user blocked in the cache gets 403 ACCOUNT_BLOCKED on every route', async () => {
      const { token, user } = await signUp();
      await seed(user.id, [{ id: 1 }]);
      await blocklist.block(user.id);
      for (const [method, path] of routes) {
        const res = await call(method, path).set(auth(token)).expect(403);
        expect(res.body).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_BLOCKED',
        });
      }
      expect(await prisma.favorite.count()).toBe(1);
    });

    it('a deleted user with a still-valid token: list, ids and PUT are 401, DELETE stays 204', async () => {
      const { token, user } = await signUp();
      await prisma.user.delete({ where: { id: user.id } });
      for (const res of [
        await list(token).expect(401),
        await ids(token).expect(401),
        await put(token, 'movie/603').expect(401),
      ]) {
        expect(res.body).toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      }
      await del(token, 'movie/603').expect(204);
      expect(await prisma.favorite.count()).toBe(0);
    });
  });
});
