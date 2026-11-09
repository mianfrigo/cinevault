import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageUrl } from './tmdb.constants';
import { mapDetail, mapSeason, mapSummary } from './tmdb.mapper';
import type { TmdbListItem, TmdbSeason } from './tmdb.types';

const fx = <T>(name: string) =>
  JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as T;
const list = fx<Record<string, TmdbListItem>>('list.json');

describe('mapSummary', () => {
  it('maps a full movie', () => {
    expect(mapSummary(list.movie)).toEqual({
      tmdbId: 603,
      mediaType: 'movie',
      title: 'The Matrix',
      year: 1999,
      rating: 8.2,
      posterUrl: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/matrix-bg.jpg',
      overview: 'A hacker learns the truth about his reality.',
    });
  });

  it('returns nulls for missing poster, backdrop, overview, date and rating', () => {
    expect(mapSummary(list.minimal, 'movie')).toEqual({
      tmdbId: 42,
      mediaType: 'movie',
      title: 'Obscure Film',
      year: null,
      rating: null,
      posterUrl: null,
      backdropUrl: null,
      overview: null,
    });
    expect(mapSummary(list.noRatingField, 'movie')?.rating).toBeNull();
  });

  it('returns null for media_type person', () => {
    expect(mapSummary(list.person)).toBeNull();
  });

  it('uses name and first_air_date for tv', () => {
    expect(mapSummary(list.tv)).toMatchObject({
      mediaType: 'tv',
      title: 'Breaking Bad',
      year: 2008,
      rating: 8.9,
    });
  });

  it('falls back to the given type when media_type is absent', () => {
    expect(mapSummary(list.minimal, 'tv')?.mediaType).toBe('tv');
    expect(mapSummary(list.minimal)).toBeNull();
  });
});

describe('mapDetail', () => {
  it('maps a full movie', () => {
    const d = mapDetail(fx('movie-detail.json'), 'movie');
    expect(d).toMatchObject({
      tmdbId: 603,
      mediaType: 'movie',
      title: 'The Matrix',
      posterUrl: 'https://image.tmdb.org/t/p/w500/matrix.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/matrix-bg.jpg',
      tagline: 'Welcome to the Real World.',
      runtimeMinutes: 136,
      seasons: null,
      status: 'Released',
      originalLanguage: 'en',
      director: 'Lana Wachowski',
      trailerUrl: 'https://www.youtube.com/watch?v=m8e-FF8MsqU',
      seasonList: [],
      genres: [
        { id: 28, name: 'Action' },
        { id: 878, name: 'Science Fiction' },
      ],
    });
    expect(d.cast).toHaveLength(12);
    expect(d.cast[0]).toEqual({ name: 'Keanu Reeves', character: 'Neo' });
    expect(d.similar).toHaveLength(12);
    expect(d.similar[0]).toMatchObject({ tmdbId: 604, mediaType: 'movie' });
    expect(d.similar.map((s) => s.tmdbId)).not.toContain(9999);
  });

  it('maps tv seasons, runtime and season count', () => {
    const d = mapDetail(fx('tv-detail.json'), 'tv');
    expect(d).toMatchObject({
      mediaType: 'tv',
      title: 'Breaking Bad',
      year: 2008,
      runtimeMinutes: 47,
      seasons: 5,
      seasonList: [
        { number: 1, name: 'Season 1', episodeCount: 7 },
        { number: 2, name: 'Season 2', episodeCount: 13 },
      ],
      director: null,
    });
  });

  it('returns empty cast, null trailer and null director when credits and videos are empty', () => {
    const d = mapDetail(fx('detail-empty-lists.json'), 'movie');
    expect(d.cast).toEqual([]);
    expect(d.trailerUrl).toBeNull();
    expect(d.director).toBeNull();
    expect(d.similar).toEqual([]);
    expect(d).toMatchObject({
      tagline: null,
      overview: null,
      runtimeMinutes: null,
      year: null,
      rating: null,
      posterUrl: null,
      backdropUrl: null,
    });
  });

  it('never throws when every nullable field is missing', () => {
    const d = mapDetail(fx('detail-minimal.json'), 'movie');
    expect(d).toMatchObject({
      tmdbId: 42,
      title: 'Obscure Film',
      cast: [],
      similar: [],
      genres: [],
      seasonList: [],
      status: null,
      originalLanguage: null,
      trailerUrl: null,
      director: null,
      runtimeMinutes: null,
    });
  });
});

describe('mapSeason', () => {
  it('maps episodes with nullable air date and overview', () => {
    expect(mapSeason(fx<TmdbSeason>('season.json'))).toEqual({
      number: 1,
      episodes: [
        {
          number: 1,
          name: 'Pilot',
          airDate: '2008-01-20',
          overview: 'Walter begins.',
        },
        {
          number: 2,
          name: "Cat's in the Bag...",
          airDate: null,
          overview: null,
        },
      ],
    });
  });
});

describe('imageUrl', () => {
  it('returns null for null path', () => {
    expect(imageUrl(null, 'w342')).toBeNull();
  });
});
