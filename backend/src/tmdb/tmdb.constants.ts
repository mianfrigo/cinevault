export const IMG = {
  poster: 'w342',
  posterLarge: 'w500',
  backdrop: 'w1280',
} as const;

export const imageUrl = (path: string | null, size: string): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

/** DI token for optional TmdbClient tuning (tests lower the timeout). */
export const TMDB_CLIENT_OPTIONS = Symbol('TMDB_CLIENT_OPTIONS');
