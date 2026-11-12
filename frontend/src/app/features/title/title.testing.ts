import { SeasonDetail, TitleDetail } from '@core/models';

/** Spec fixtures for the title page. */
export const movie: TitleDetail = {
  tmdbId: 603,
  mediaType: 'movie',
  title: 'The Matrix',
  year: 1999,
  rating: 8.2,
  posterUrl: 'https://image.tmdb.org/t/p/w500/matrix.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/matrix-back.jpg',
  overview: 'A hacker learns the world is a simulation.',
  tagline: 'Welcome to the real world.',
  runtimeMinutes: 136,
  seasons: null,
  genres: [
    { id: 28, name: 'Action' },
    { id: 878, name: 'Science Fiction' },
  ],
  status: 'Released',
  originalLanguage: 'en',
  director: 'Lana Wachowski',
  cast: [
    { name: 'Keanu Reeves', character: 'Neo' },
    { name: 'Laurence Fishburne', character: 'Morpheus' },
    { name: 'Carrie-Anne Moss', character: null },
  ],
  trailerUrl: 'https://www.youtube.com/watch?v=vKQi3bBA1y8',
  similar: [
    {
      tmdbId: 604,
      mediaType: 'movie',
      title: 'The Matrix Reloaded',
      year: 2003,
      rating: 7.0,
      posterUrl: null,
      backdropUrl: null,
      overview: null,
    },
  ],
  seasonList: [],
};

export const series: TitleDetail = {
  ...movie,
  tmdbId: 1399,
  mediaType: 'tv',
  title: 'Cold Meridian',
  year: 2025,
  runtimeMinutes: null,
  seasons: 2,
  director: null,
  status: 'Returning Series',
  similar: [],
  seasonList: [
    { number: 1, name: 'Season 1', episodeCount: 2 },
    { number: 2, name: 'Season 2', episodeCount: 1 },
  ],
};

export const season1: SeasonDetail = {
  number: 1,
  episodes: [
    { number: 1, name: 'Winter-over', airDate: '2025-01-10', overview: 'The crew settles in.' },
    { number: 2, name: 'Resupply', airDate: null, overview: null },
  ],
};

export const season2: SeasonDetail = {
  number: 2,
  episodes: [{ number: 1, name: 'Thaw', airDate: null, overview: 'Spring, at last.' }],
};
