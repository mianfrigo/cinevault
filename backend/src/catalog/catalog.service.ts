import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { AppException } from '../common/app.exception';
import { paged, type Paged } from '../common/paged';
import { cached } from '../cache/cached';
import { TMDB_MAX_PAGE } from './catalog.dto';
import { TmdbClient } from '../tmdb/tmdb.client';
import { mapDetail, mapSeason, mapSummary } from '../tmdb/tmdb.mapper';
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
   * Summaries through the detail cache. `null` where TMDB says NOT_FOUND;
   * TMDB_UNAVAILABLE propagates (502).
   */
  summaries(
    refs: { mediaType: MediaTypeParam; tmdbId: number }[],
  ): Promise<(TitleSummary | null)[]> {
    return Promise.all(
      refs.map(async ({ mediaType, tmdbId }) => {
        try {
          const d = await this.detail(mediaType, tmdbId);
          return {
            tmdbId: d.tmdbId,
            mediaType: d.mediaType,
            title: d.title,
            year: d.year,
            rating: d.rating,
            posterUrl: d.posterUrl,
            backdropUrl: d.backdropUrl,
            overview: d.overview,
          };
        } catch (e) {
          if (e instanceof AppException && e.code === 'NOT_FOUND') return null;
          throw e;
        }
      }),
    );
  }
}
