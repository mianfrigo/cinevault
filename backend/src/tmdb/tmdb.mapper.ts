import { IMG, imageUrl } from './tmdb.constants';
import type {
  MediaTypeParam,
  SeasonDetail,
  TitleDetail,
  TitleSummary,
  TmdbDetail,
  TmdbListItem,
  TmdbSeason,
} from './tmdb.types';

const orNull = (s?: string | null) => (s ? s : null);

const toYear = (date?: string | null): number | null => {
  const y = Number(date?.slice(0, 4));
  return Number.isInteger(y) && y > 0 ? y : null;
};

const toRating = (avg?: number | null, votes?: number | null) =>
  !votes || typeof avg !== 'number' ? null : Math.round(avg * 10) / 10;

export function mapSummary(
  raw: TmdbListItem,
  fallbackType?: MediaTypeParam,
): TitleSummary | null {
  const type = raw.media_type ?? fallbackType;
  if (type !== 'movie' && type !== 'tv') return null;
  return {
    tmdbId: raw.id,
    mediaType: type,
    title: raw.title ?? raw.name ?? '',
    year: toYear(raw.release_date ?? raw.first_air_date),
    rating: toRating(raw.vote_average, raw.vote_count),
    posterUrl: imageUrl(raw.poster_path ?? null, IMG.poster),
    backdropUrl: imageUrl(raw.backdrop_path ?? null, IMG.backdrop),
    overview: orNull(raw.overview),
  };
}

export function mapDetail(raw: TmdbDetail, type: MediaTypeParam): TitleDetail {
  const base = mapSummary({ ...raw, media_type: type }, type)!;
  const trailer = raw.videos?.results?.find(
    (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.key,
  );
  return {
    ...base,
    posterUrl: imageUrl(raw.poster_path ?? null, IMG.posterLarge),
    tagline: orNull(raw.tagline),
    runtimeMinutes:
      (type === 'tv' ? raw.episode_run_time?.[0] : raw.runtime) || null,
    seasons: type === 'tv' ? (raw.number_of_seasons ?? null) : null,
    genres: raw.genres ?? [],
    status: orNull(raw.status),
    originalLanguage: orNull(raw.original_language),
    director:
      raw.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
    cast: (raw.credits?.cast ?? []).slice(0, 12).map((c) => ({
      name: c.name,
      character: orNull(c.character),
    })),
    trailerUrl: trailer
      ? `https://www.youtube.com/watch?v=${trailer.key}`
      : null,
    similar: (raw.similar?.results ?? [])
      .map((s) => mapSummary(s, type))
      .filter((s): s is TitleSummary => s !== null)
      .slice(0, 12),
    seasonList:
      type === 'tv'
        ? (raw.seasons ?? [])
            .filter((s) => s.season_number > 0)
            .map((s) => ({
              number: s.season_number,
              name: s.name ?? `Season ${s.season_number}`,
              episodeCount: s.episode_count ?? 0,
            }))
        : [],
  };
}

export function mapSeason(raw: TmdbSeason): SeasonDetail {
  return {
    number: raw.season_number,
    episodes: (raw.episodes ?? []).map((e) => ({
      number: e.episode_number,
      name: e.name ?? '',
      airDate: orNull(e.air_date),
      overview: orNull(e.overview),
    })),
  };
}
