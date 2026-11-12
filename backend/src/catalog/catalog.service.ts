import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { AppException } from '../common/app.exception';
import type { Paged } from '../common/paged';
import { cached } from '../cache/cached';
import { TmdbClient } from '../tmdb/tmdb.client';
import { IMG, TMDB_MAX_PAGE, imageUrl } from '../tmdb/tmdb.constants';
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
const TTL = {
  day: 24 * HOUR,
  list: HOUR,
  search: 10 * MINUTE,
  degraded: 5 * MINUTE,
};

/** Parallel TMDB loads per `summaries` or `genreCovers` call, so neither can flood TMDB. */
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

export interface GenreCover {
  id: number;
  name: string;
  coverUrl: string | null;
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
): Paged<TitleSummary> => ({
  items: (raw.results ?? []).flatMap((r) => mapSummary(r, fallbackType) ?? []),
  page,
  totalPages: Math.min(raw.total_pages ?? 1, TMDB_MAX_PAGE),
  totalItems: raw.total_results ?? 0,
});

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

  /**
   * One card-size backdrop per genre, from the most popular titles of that genre,
   * never the same title twice (genres are served in list order). Cached whole.
   * A genre whose lookup fails (other than a clean 404) gets `null` and the result
   * is cached for 5 minutes instead of 24 h: that still shields TMDB during an
   * outage (one burst per 5 minutes, not per request) without pinning the gaps all day.
   */
  genreCovers(type: MediaTypeParam): Promise<GenreCover[]> {
    let degraded = false;
    return cached(
      this.cache,
      `tmdb:/genre-covers/${type}:`,
      () => (degraded ? TTL.degraded : TTL.day),
      async () => {
        const genres = await this.genres(type);
        const pages = await mapLimit(genres, SUMMARY_CONCURRENCY, async (g) => {
          try {
            return await this.tmdb.get<TmdbPage>(`/discover/${type}`, {
              with_genres: g.id,
              sort_by: 'popularity.desc',
            });
          } catch (e) {
            if (!(e instanceof AppException && e.code === 'NOT_FOUND')) {
              degraded = true;
            }
            return null;
          }
        });
        const used = new Set<number>();
        return genres.map((g, i) => {
          const pick = pages[i]?.results?.find(
            (r) => r.backdrop_path && !used.has(r.id),
          );
          if (pick) used.add(pick.id);
          return {
            ...g,
            coverUrl: imageUrl(pick?.backdrop_path ?? null, IMG.backdropCard),
          };
        });
      },
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
