/** TMDB backdrop widths we ask for: a 390 px phone at 2x needs 780, a laptop needs 1280. */
export const BACKDROP_SIZES = [780, 1280] as const;

const TMDB_IMAGE = /^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+(\/.+)$/;

/**
 * `srcset` for a backdrop the API gave as one URL (it carries the largest size). Pair it with
 * `sizes="100vw"` so a phone downloads the 780 px picture, about half the bytes of the 1280 px one.
 */
export function backdropSrcset(url: string | null): string | null {
  const match = url ? TMDB_IMAGE.exec(url) : null;
  if (!match) return null;
  return BACKDROP_SIZES.map((w) => `${match[1]}w${w}${match[2]} ${w}w`).join(', ');
}
