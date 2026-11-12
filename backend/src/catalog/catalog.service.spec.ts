import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { AppException } from '../common/app.exception';
import type { Env } from '../config/env';
import { TmdbClient } from '../tmdb/tmdb.client';
import { CatalogService } from './catalog.service';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const KEY = 'tmdb:/genre-covers/movie:';
const unavailable = () =>
  new AppException(502, 'TMDB_UNAVAILABLE', 'Movie database is unavailable');
const notFound = () => new AppException(404, 'NOT_FOUND', 'Title not found');

const genres = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 18, name: 'Drama' },
];
const hit = (id: number, backdrop: string | null = `/b${id}.jpg`) => ({
  id,
  backdrop_path: backdrop,
});
const file = (url: string | null) => url?.split('/').pop() ?? null;

type Discover = Record<number, unknown>;

const fakeCache = () => {
  const store = new Map<string, unknown>();
  return {
    get: jest.fn((k: string) => Promise.resolve(store.get(k))),
    set: jest.fn((k: string, v: unknown) => {
      store.set(k, v);
      return Promise.resolve(v);
    }),
  };
};

/** TmdbClient stand-in: genre list plus one discover page per genre id. */
function setup(discover: Discover, genreList: unknown = { genres }) {
  const cache = fakeCache();
  let inFlight = 0;
  let maxInFlight = 0;
  const get = jest.fn(
    async (path: string, query: Record<string, string | number> = {}) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, 1));
        if (path.startsWith('/genre/')) {
          if (genreList instanceof Error) throw genreList;
          return genreList;
        }
        const r = discover[Number(query.with_genres)];
        if (r instanceof Error) throw r;
        return r ?? { results: [] };
      } finally {
        inFlight--;
      }
    },
  );
  const service = new CatalogService(
    { get } as unknown as TmdbClient,
    cache as unknown as Cache,
  );
  return { service, get, cache, maxInFlight: () => maxInFlight };
}

describe('CatalogService.genreCovers', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns one w780 backdrop per genre, in genre-list order', async () => {
    const { service, get } = setup({
      28: { results: [hit(1)] },
      12: { results: [hit(2)] },
      18: { results: [hit(3)] },
    });
    const base = 'https://image.tmdb.org/t/p/w780';
    expect(await service.genreCovers('movie')).toEqual([
      { id: 28, name: 'Action', coverUrl: `${base}/b1.jpg` },
      { id: 12, name: 'Adventure', coverUrl: `${base}/b2.jpg` },
      { id: 18, name: 'Drama', coverUrl: `${base}/b3.jpg` },
    ]);
    expect(get).toHaveBeenCalledWith('/discover/movie', {
      with_genres: 28,
      sort_by: 'popularity.desc',
    });
  });

  it('never uses the same title for two genres', async () => {
    const { service } = setup({
      28: { results: [hit(1), hit(2)] },
      12: { results: [hit(1), hit(3)] },
      18: { results: [hit(1), hit(3), hit(4)] },
    });
    const out = await service.genreCovers('movie');
    expect(out.map((g) => file(g.coverUrl))).toEqual([
      'b1.jpg',
      'b3.jpg',
      'b4.jpg',
    ]);
  });

  it('skips results without a backdrop and gives null when none is left', async () => {
    const { service } = setup({
      28: { results: [hit(1, null), hit(2)] },
      12: { results: [hit(2), hit(5, null)] },
      18: { results: [] },
    });
    const out = await service.genreCovers('movie');
    expect(out.map((g) => file(g.coverUrl))).toEqual(['b2.jpg', null, null]);
  });

  it('gives null for a genre whose lookup failed and still resolves the rest', async () => {
    const { service } = setup({
      28: { results: [hit(1)] },
      12: unavailable(),
      18: { results: [hit(3)] },
    });
    const out = await service.genreCovers('movie');
    expect(out.map((g) => file(g.coverUrl))).toEqual([
      'b1.jpg',
      null,
      'b3.jpg',
    ]);
  });

  it('propagates TMDB_UNAVAILABLE when the genre list fails', async () => {
    const { service } = setup({}, unavailable());
    await expect(service.genreCovers('movie')).rejects.toMatchObject({
      code: 'TMDB_UNAVAILABLE',
    });
  });

  it('loads at most 5 discover pages at once', async () => {
    const many = Array.from({ length: 19 }, (_, i) => ({
      id: i + 1,
      name: `G${i}`,
    }));
    const discover: Discover = {};
    many.forEach((g) => (discover[g.id] = { results: [hit(100 + g.id)] }));
    const { service, get, maxInFlight } = setup(discover, { genres: many });
    const out = await service.genreCovers('tv');
    expect(out).toHaveLength(19);
    expect(get).toHaveBeenCalledTimes(20); // genre list + 19 discovers
    expect(maxInFlight()).toBeGreaterThan(1);
    expect(maxInFlight()).toBeLessThanOrEqual(5);
  });

  it('caches the whole result for 24 h, keyed by type, so a repeat call is free', async () => {
    const { service, get, cache } = setup({ 28: { results: [hit(1)] } });
    const first = await service.genreCovers('movie');
    const calls = get.mock.calls.length;
    expect(await service.genreCovers('movie')).toEqual(first);
    expect(get).toHaveBeenCalledTimes(calls);
    expect(cache.set).toHaveBeenCalledWith(KEY, first, DAY);
  });

  it('treats a 404 as a clean empty result and caches it for 24 h', async () => {
    const { service, cache } = setup({ 28: notFound() });
    const out = await service.genreCovers('movie');
    expect(out[0].coverUrl).toBeNull();
    expect(cache.set).toHaveBeenCalledWith(KEY, out, DAY);
  });

  it('caches a degraded result for only 5 minutes', async () => {
    const { service, cache } = setup({
      28: { results: [hit(1)] },
      12: unavailable(),
    });
    const out = await service.genreCovers('movie');
    expect(cache.set).toHaveBeenCalledWith(KEY, out, 5 * MINUTE);
  });

  it('sends include_adult=false on every discover request', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        Promise.resolve(
          Response.json(
            (url as string).includes('/genre/')
              ? { genres }
              : { results: [hit(Math.random())] },
          ),
        ),
      );
    const tmdb = new TmdbClient({
      tmdbBaseUrl: 'http://tmdb.test/3',
      tmdbReadToken: 'test-token',
    } as Env);
    await new CatalogService(tmdb, fakeCache() as unknown as Cache).genreCovers(
      'movie',
    );
    const discoverUrls = fetchSpy.mock.calls
      .map(([u]) => new URL(u as string))
      .filter((u) => u.pathname.endsWith('/discover/movie'));
    expect(discoverUrls).toHaveLength(genres.length);
    for (const u of discoverUrls) {
      expect(u.searchParams.get('include_adult')).toBe('false');
    }
  });
});
