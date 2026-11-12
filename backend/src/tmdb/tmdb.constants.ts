export const IMG = {
  poster: 'w342',
  posterLarge: 'w500',
  backdrop: 'w1280',
  backdropCard: 'w780',
} as const;

export const imageUrl = (path: string | null, size: string): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

/** TMDB serves at most 500 pages. */
export const TMDB_MAX_PAGE = 500;
