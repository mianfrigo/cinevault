// DTO types of the backend API (docs/backend-schema.md section 4). Keep in sync with the backend.

export type MediaTypeParam = 'movie' | 'tv';
export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaTypeParam;
  title: string;
  year: number | null;
  rating: number | null; // 0-10, one decimal
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface Genre {
  id: number;
  name: string;
}

/** A genre with a TMDB backdrop of its most popular title; null when none was found. */
export interface GenreCover extends Genre {
  coverUrl: string | null;
}

export interface TitleDetail extends TitleSummary {
  tagline: string | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  genres: Genre[];
  status: string | null;
  originalLanguage: string | null;
  director: string | null;
  cast: { name: string; character: string | null }[]; // top 12
  trailerUrl: string | null; // https://www.youtube.com/watch?v=<key>
  similar: TitleSummary[]; // up to 12
  seasonList: { number: number; name: string; episodeCount: number }[]; // tv only
}

export interface SeasonDetail {
  number: number;
  episodes: { number: number; name: string; airDate: string | null; overview: string | null }[];
}

export interface PublicConfig {
  features: { downloadButton: boolean };
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
}

export interface AuthResult {
  accessToken: string;
  user: UserDto;
}

export type FavoriteItem = TitleSummary & { addedAt: string; unavailable?: boolean };

export interface FavoriteId {
  mediaType: MediaTypeParam;
  tmdbId: number;
}

export interface AdminOverview {
  totalUsers: number;
  newThisWeek: number;
  recentSignups: UserDto[];
}
