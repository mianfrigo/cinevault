// Public DTOs: contract in docs/backend-schema.md section 4.
export type MediaTypeParam = 'movie' | 'tv';

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaTypeParam;
  title: string;
  year: number | null;
  rating: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
}

export interface TitleDetail extends TitleSummary {
  tagline: string | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  genres: { id: number; name: string }[];
  status: string | null;
  originalLanguage: string | null;
  director: string | null;
  cast: { name: string; character: string | null }[];
  trailerUrl: string | null;
  similar: TitleSummary[];
  seasonList: { number: number; name: string; episodeCount: number }[];
}

export interface SeasonDetail {
  number: number;
  episodes: {
    number: number;
    name: string;
    airDate: string | null;
    overview: string | null;
  }[];
}

// Raw TMDB payloads: only the fields we read; TMDB omits or nulls most of them.
export interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
}

export interface TmdbDetail extends TmdbListItem {
  tagline?: string | null;
  runtime?: number | null;
  episode_run_time?: number[] | null;
  number_of_seasons?: number | null;
  status?: string | null;
  original_language?: string | null;
  genres?: { id: number; name: string }[] | null;
  seasons?:
    { season_number: number; name?: string; episode_count?: number }[] | null;
  credits?: {
    cast?: { name: string; character?: string | null }[] | null;
    crew?: { name: string; job?: string }[] | null;
  } | null;
  videos?: {
    results?: { site?: string; type?: string; key?: string }[] | null;
  } | null;
  similar?: { results?: TmdbListItem[] | null } | null;
}

export interface TmdbSeason {
  season_number: number;
  episodes?:
    | {
        episode_number: number;
        name?: string;
        air_date?: string | null;
        overview?: string | null;
      }[]
    | null;
}
