import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppException } from '../src/common/app.exception';
import { TmdbClient } from '../src/tmdb/tmdb.client';
import type { TmdbListItem } from '../src/tmdb/tmdb.types';
import { flushTestRedis, redisPttl } from './helpers/redis';

const fx = <T>(name: string) =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', 'src', 'tmdb', '__fixtures__', name),
      'utf8',
    ),
  ) as T;
const items = fx<Record<string, TmdbListItem>>('list.json');
const listing = (
  results: TmdbListItem[],
  totalPages = 3,
  totalResults = 60,
) => ({
  page: 1,
  total_pages: totalPages,
  total_results: totalResults,
  results,
});

/** Serves fixtures and records every call, so tests can assert cache hits. */
class FakeTmdb {
  calls: string[] = [];
  failWith?: AppException;

  get(path: string, query: Record<string, string | number> = {}) {
    this.calls.push(
      `${path}?${new URLSearchParams(query as Record<string, string>)}`,
    );
    if (this.failWith) return Promise.reject(this.failWith);
    if (path === '/search/multi') {
      return Promise.resolve(
        listing([items.movie, items.person, items.tv], 1000, 3),
      );
    }
    if (path === '/movie/603') return Promise.resolve(fx('movie-detail.json'));
    if (path === '/tv/1396') return Promise.resolve(fx('tv-detail.json'));
    if (path === '/tv/1396/season/1') {
      return Promise.resolve(fx('season.json'));
    }
    if (path.startsWith('/genre/')) {
      return Promise.resolve({ genres: [{ id: 28, name: 'Action' }] });
    }
    if (/^\/(movie|tv)\/\d+/.test(path)) {
      return Promise.reject(
        new AppException(404, 'NOT_FOUND', 'Title not found'),
      );
    }
    const twenty = Array.from({ length: 20 }, (_, i) => ({
      ...items.movie,
      id: 1000 + i,
    }));
    return Promise.resolve(listing(twenty));
  }
}

async function buildApp(tmdb: FakeTmdb): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TmdbClient)
    .useValue(tmdb)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

const json = (res: { body: unknown }) => res.body as Record<string, any>;

describe('Catalog (e2e)', () => {
  let app: NestExpressApplication;
  let tmdb: FakeTmdb;
  const get = (url: string) => request(app.getHttpServer()).get(url);

  beforeAll(() => {
    // Expected warnings (Redis down) would clutter the test output.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  beforeEach(async () => {
    await flushTestRedis();
    tmdb = new FakeTmdb();
    app = await buildApp(tmdb);
  });

  afterEach(() => app.close());
  afterAll(() => jest.restoreAllMocks());

  it('GET /catalog/trending?type=movie returns Paged<TitleSummary> with at most 20 items', async () => {
    const res = await get('/api/v1/catalog/trending?type=movie').expect(200);
    expect(res.body).toMatchObject({ page: 1, totalPages: 3, totalItems: 60 });
    const list = json(res).items as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(20);
    expect(list[0]).toMatchObject({ mediaType: 'movie', title: 'The Matrix' });
    expect(tmdb.calls[0]).toMatch(/^\/trending\/movie\/week\?/);
  });

  it('second identical request does not call TmdbClient again', async () => {
    await get('/api/v1/catalog/trending?type=movie').expect(200);
    await get('/api/v1/catalog/trending?type=movie').expect(200);
    expect(tmdb.calls).toHaveLength(1);
  });

  it('stores each response in Redis with its TTL', async () => {
    const hour = 3_600_000;
    await get('/api/v1/catalog/trending?type=movie&page=2').expect(200);
    await get('/api/v1/catalog/movie/603').expect(200);
    await get('/api/v1/catalog/search?q=matrix').expect(200);
    const ttl = (key: string) => redisPttl(key);
    expect(await ttl('tmdb:/trending/movie/week:page=2')).toBeGreaterThan(
      hour - 5000,
    );
    expect(await ttl('tmdb:/trending/movie/week:page=2')).toBeLessThanOrEqual(
      hour,
    );
    expect(
      await ttl(
        'tmdb:/movie/603:append_to_response=credits%2Cvideos%2Csimilar',
      ),
    ).toBeGreaterThan(24 * hour - 5000);
    expect(await ttl('tmdb:/search/multi:page=1&query=matrix')).toBeGreaterThan(
      600_000 - 5000,
    );
  });

  it('maps every list kind to its TMDB path, type defaulting to movie', async () => {
    await get('/api/v1/catalog/popular').expect(200);
    await get('/api/v1/catalog/top-rated?type=tv').expect(200);
    await get('/api/v1/catalog/new').expect(200);
    await get('/api/v1/catalog/new?type=tv').expect(200);
    await get('/api/v1/catalog/discover?type=tv&genre=18&page=2').expect(200);
    expect(tmdb.calls.map((c) => c.split('?')[0])).toEqual([
      '/movie/popular',
      '/tv/top_rated',
      '/movie/now_playing',
      '/tv/on_the_air',
      '/discover/tv',
    ]);
    expect(tmdb.calls[4]).toContain('with_genres=18');
    expect(tmdb.calls[4]).toContain('page=2');
  });

  it('GET /catalog/genres returns the genre list', async () => {
    const res = await get('/api/v1/catalog/genres?type=movie').expect(200);
    expect(res.body).toEqual([{ id: 28, name: 'Action' }]);
  });

  it('search keeps only movies and series and caps totalPages at 500', async () => {
    const res = await get('/api/v1/catalog/search?q=%20matrix%20').expect(200);
    const list = json(res).items as { mediaType: string }[];
    expect(list.map((i) => i.mediaType)).toEqual(['movie', 'tv']);
    expect(res.body).toMatchObject({ totalPages: 500, totalItems: 3 });
    expect(tmdb.calls[0]).toContain('query=matrix');
  });

  it('search?q= (empty) is 400 VALIDATION_ERROR', async () => {
    const res = await get('/api/v1/catalog/search?q=').expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(json(res).message).toContain('q must be longer than');
    await get('/api/v1/catalog/search?q=%20%20').expect(400);
    await get('/api/v1/catalog/search').expect(400);
  });

  it('search with 101 chars is 400', async () => {
    const res = await get(`/api/v1/catalog/search?q=${'a'.repeat(101)}`).expect(
      400,
    );
    expect(json(res).code).toBe('VALIDATION_ERROR');
    expect(json(res).message).toContain('q must be shorter than');
    await get(`/api/v1/catalog/search?q=${'a'.repeat(100)}`).expect(200);
  });

  it('page=0 and page=501 are 400', async () => {
    for (const p of ['0', '501', 'abc', '1.5']) {
      const res = await get(`/api/v1/catalog/popular?page=${p}`).expect(400);
      expect(json(res).code).toBe('VALIDATION_ERROR');
      expect(json(res).message).toContain('page must');
    }
    await get('/api/v1/catalog/popular?page=500').expect(200);
  });

  it('rejects an unknown type with 400 VALIDATION_ERROR', async () => {
    const res = await get('/api/v1/catalog/trending?type=person').expect(400);
    expect(json(res).code).toBe('VALIDATION_ERROR');
    expect(json(res).message).toContain('type must be one of');
    const detail = await get('/api/v1/catalog/person/603').expect(400);
    expect(json(detail).code).toBe('VALIDATION_ERROR');
    expect(json(detail).message).toContain('type must be one of');
  });

  it('GET /catalog/movie/603 returns TitleDetail', async () => {
    const res = await get('/api/v1/catalog/movie/603').expect(200);
    expect(res.body).toMatchObject({
      tmdbId: 603,
      mediaType: 'movie',
      title: 'The Matrix',
    });
    expect(json(res).cast).toBeInstanceOf(Array);
    expect(tmdb.calls[0]).toContain(
      'append_to_response=credits%2Cvideos%2Csimilar',
    );
  });

  it('GET /catalog/tv/:id/season/:n returns the season; ids must be positive integers', async () => {
    const res = await get('/api/v1/catalog/tv/1396/season/1').expect(200);
    expect(res.body).toMatchObject({ number: 1 });
    await get('/api/v1/catalog/tv/0/season/1').expect(400);
    await get('/api/v1/catalog/tv/1396/season/-1').expect(400);
    await get('/api/v1/catalog/movie/abc').expect(400);
    await get('/api/v1/catalog/movie/0').expect(400);
  });

  it('unknown id returns 404 NOT_FOUND', async () => {
    const res = await get('/api/v1/catalog/movie/999999').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('TMDB_UNAVAILABLE from the client returns 502 with code TMDB_UNAVAILABLE and is not cached', async () => {
    tmdb.failWith = new AppException(502, 'TMDB_UNAVAILABLE', 'down');
    const res = await get('/api/v1/catalog/popular').expect(502);
    expect(res.body).toMatchObject({
      statusCode: 502,
      code: 'TMDB_UNAVAILABLE',
    });
    tmdb.failWith = undefined;
    await get('/api/v1/catalog/popular').expect(200);
    expect(tmdb.calls).toHaveLength(2);
  });

  it('with an unreachable Redis URL the endpoint still returns 200', async () => {
    await app.close();
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://127.0.0.1:1/1'; // nothing listens on port 1
    try {
      app = await buildApp(tmdb);
    } finally {
      process.env.REDIS_URL = saved;
    }
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      await get('/api/v1/catalog/trending?type=tv').expect(200);
      expect(Date.now() - started).toBeLessThan(2000);
    }
    // The in-memory fallback still caches.
    expect(tmdb.calls).toHaveLength(1);
    // Windows is slow to refuse a connection: give the abandoned attempts time to
    // die so Jest's worker can exit cleanly.
    await new Promise((r) => setTimeout(r, 1500));
  });
});
