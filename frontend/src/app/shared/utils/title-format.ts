import { MediaTypeParam } from '@core/models';

/** "Movie" or "Series". */
export function mediaTypeLabel(mediaType: MediaTypeParam): string {
  return mediaType === 'tv' ? 'Series' : 'Movie';
}

/** Alt text of a poster: "Dune (2021)", or just the title when the year is unknown. */
export function titleAlt(t: { title: string; year: number | null }): string {
  return t.year === null ? t.title : `${t.title} (${t.year})`;
}

/** The meta line of a card: "2021 · Movie", or just "Movie" when the year is unknown. */
export function titleMeta(t: { mediaType: MediaTypeParam; year: number | null }): string {
  const type = mediaTypeLabel(t.mediaType);
  return t.year === null ? type : `${t.year} · ${type}`;
}
