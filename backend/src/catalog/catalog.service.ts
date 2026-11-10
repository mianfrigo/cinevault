import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { AppException } from '../common/app.exception';
import { paged, type Paged } from '../common/paged';
import { cached } from '../cache/cached';
import { TmdbClient } from '../tmdb/tmdb.client';
import { TMDB_MAX_PAGE } from '../tmdb/tmdb.constants';
import {
  mapDetail,
  mapSeason,
  mapSummary,
  toCardSummary,
} from '../tmdb/tmdb.mapper';
import type {
  MediaTypeParam,
  SeasonDetail,
  TitleDetail,
  TitleSummary,
  TmdbDetail,
  TmdbListItem,
  TmdbSeason,
} from '../tmdb/tmdb.types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TTL = { day: 24 * HOUR, list: HOUR, search: 10 * MINUTE };

/** Parallel TMDB detail loads per `summaries` call, so a page of favorites cannot flood TMDB. */
const SUMMARY_CONCURRENCY = 5;

/** `Promise.all(items.map(fn))` with at most `limit` running; stops starting new work after a failure. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        next = items.length;
        throw e;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

export type ListKind = 'trending' | 'popular' | 'top-rated' | 'new';

interface TmdbPage {
  results?: TmdbListItem[] | null;
  total_pages?: number;
  total_results?: number;
}

const listPath = (kind: ListKind, type: MediaTypeParam): string => {
  switch (kind) {
    case 'trending':
      return `/trending/${type}/week`;
    case 'popular':
      return `/${type}/popular`;
    case 'top-rated':
      return `/${type}/top_rated`;
    case 'new':
      return type === 'movie' ? '/movie/now_playing' : '/tv/on_the_air';
  }
};

const toPaged = (
  raw: TmdbPage,
  page: number,
  fallbackType?: MediaTypeParam,
): Paged<TitleSummary> =>
  paged(
    (raw.results ?? []).flatMap((r) => mapSummary(r, fallbackType) ?? []),
    page,
    Math.min(raw.total_pages ?? 1, TMDB_MAX_PAGE),
    raw.total_results ?? 0,
  );

@Injectable()
export class CatalogService {
  constructor(
    private readonly tmdb: TmdbClient,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Cache key `tmdb:<route>:<sorted query>`; the cached value is the mapped DTO. */
  private fetch<Raw, R>(
    path: string,
    query: Record<string, string | number>,
    ttlMs: number,
    map: (raw: Raw) => R,
  ): Promise<R> {
    const sorted = Object.entries(query)
      .map(([k, v]) => [k, String(v)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const key = `tmdb:${path}:${new URLSearchParams(sorted)}`;
    return cached(this.cache, key, ttlMs, async () =>
      map(await this.tmdb.get<Raw>(path, query)),
    );
  }

  list(kind: ListKind, type: MediaTypeParam, page: number) {
    return this.fetch(
      listPath(kind, type),
      { page },
      TTL.list,
      (raw: TmdbPage) => toPaged(raw, page, type),
    );
  }

  genres(type: MediaTypeParam) {
    return this.fetch(
      `/genre/${type}/list`,
      {},
      TTL.day,
      (raw: { genres?: { id: number; name: string }[] | null }) =>
        (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    );
  }

  discover(type: MediaTypeParam, genreId: number, page: number) {
    return this.fetch(
      `/discover/${type}`,
      { with_genres: genreId, page },
      TTL.list,
      (raw: TmdbPage) => toPaged(raw, page, type),
    );
  }

  /** Movies and series only: people and anything else are dropped by the mapper. */
  search(q: string, page: number) {
    return this.fetch(
      '/search/multi',
      { query: q, page },
      TTL.search,
      (raw: TmdbPage) => toPaged(raw, page),
    );
  }

  detail(type: MediaTypeParam, id: number): Promise<TitleDetail> {
    return this.fetch(
      `/${type}/${id}`,
      { append_to_response: 'credits,videos,similar' },
      TTL.day,
      (raw: TmdbDetail) => mapDetail(raw, type),
    );
  }

  season(tvId: number, n: number): Promise<SeasonDetail> {
    return this.fetch(
      `/tv/${tvId}/season/${n}`,
      {},
      TTL.day,
      (raw: TmdbSeason) => mapSeason(raw),
    );
  }

  /**
   * Card summaries through the detail cache, at most `SUMMARY_CONCURRENCY` TMDB loads
   * at a time, in input order. `null` where TMDB says NOT_FOUND; TMDB_UNAVAILABLE
   * propagates (502).
   */
  summaries(
    refs: { mediaType: MediaTypeParam; tmdbId: number }[],
  ): Promise<(TitleSummary | null)[]> {
    return mapLimit(
      refs,
      SUMMARY_CONCURRENCY,
      async ({ mediaType, tmdbId }) => {
        try {
          return toCardSummary(await this.detail(mediaType, tmdbId));
        } catch (e) {
          if (e instanceof AppException && e.code === 'NOT_FOUND') return null;
          throw e;
        }
      },
    );
  }
}
