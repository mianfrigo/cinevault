// Fixture TMDB for the end-to-end run: no dependencies, serves exactly what the API calls
// (see backend/src/catalog and backend/src/tmdb). Fictional titles; image paths are TMDB-style
// relative paths ("/fixture-poster.jpg"); the browser side serves a placeholder for them.
//
//   node stub-tmdb.mjs [port]        (default 4010; TMDB_BASE_URL = http://127.0.0.1:4010/3)
//
// Special ids: 999999 answers 404, 500500 answers 500 (the API turns it into 502 TMDB_UNAVAILABLE).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

export const NOT_FOUND_ID = 999999;
export const FAILING_ID = 500500;
export const FIXTURE_MOVIE_ID = 603;
export const FIXTURE_MOVIE_TITLE = 'Neon Meridian';
export const FIXTURE_MOVIE_OVERVIEW =
  'A courier in a flooded city learns that the tide tables she delivers are quietly rewriting the streets.';

const MOVIE_GENRES = [
  { id: 28, name: 'Action' },
  { id: 18, name: 'Drama' },
  { id: 35, name: 'Comedy' },
  { id: 878, name: 'Science Fiction' },
  { id: 53, name: 'Thriller' },
];
const TV_GENRES = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 18, name: 'Drama' },
  { id: 35, name: 'Comedy' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
];

const MOVIE_NAMES = [
  FIXTURE_MOVIE_TITLE,
  'Paper Lanterns',
  'The Quiet Orbit',
  'Salt and Copper',
  'Hollow Harbor',
  'A Map of Small Rooms',
  'Glass Season',
  'Midnight Cartographers',
  'The Long Thaw',
  'Ember Row',
  'Static Bloom',
  'Last Train to Verdant',
  'Weather for Ghosts',
  'The Lantern Court',
  'Tidal Ledger',
  'Northbound Letters',
  'Velvet Margin',
  'The Borrowed Hour',
  'Copper Sky',
  'Fault Lines',
];
const TV_NAMES = [
  'Harbor Lights',
  'The Archive Club',
  'Saltmarsh',
  'Night Shift Radio',
  'Paper Kingdoms',
  'Quiet Rooms',
  'The Ferrymen',
  'Low Tide',
  'Signal Fires',
  'Greenhouse',
];

const movie = (i) => ({
  id: FIXTURE_MOVIE_ID + i,
  title: MOVIE_NAMES[i],
  overview: i === 0 ? FIXTURE_MOVIE_OVERVIEW : `Fixture overview for ${MOVIE_NAMES[i]}.`,
  poster_path: '/fixture-poster.jpg',
  backdrop_path: '/fixture-backdrop.jpg',
  release_date: `${2019 - i}-04-12`,
  vote_average: 6 + (i % 4) + 0.3,
  vote_count: 100 + i,
  genre_ids: [MOVIE_GENRES[i % MOVIE_GENRES.length].id],
});
const show = (i) => ({
  id: 700 + i,
  name: TV_NAMES[i],
  overview: `Fixture overview for ${TV_NAMES[i]}.`,
  poster_path: '/fixture-poster.jpg',
  backdrop_path: '/fixture-backdrop.jpg',
  first_air_date: `${2020 - i}-09-01`,
  vote_average: 7 + (i % 3) + 0.1,
  vote_count: 50 + i,
  genre_ids: [TV_GENRES[i % TV_GENRES.length].id],
});

const MOVIES = MOVIE_NAMES.map((_, i) => movie(i));
const SHOWS = TV_NAMES.map((_, i) => show(i));

const page = (items, mediaType) => ({
  page: 1,
  results: mediaType ? items.map((r) => ({ ...r, media_type: mediaType })) : items,
  total_pages: 1,
  total_results: items.length,
});

const detail = (type, id) => {
  const pool = type === 'movie' ? MOVIES : SHOWS;
  const base = pool.find((r) => r.id === id);
  if (!base) return null;
  const genres = (type === 'movie' ? MOVIE_GENRES : TV_GENRES).filter((g) =>
    base.genre_ids.includes(g.id),
  );
  return {
    ...base,
    tagline: 'Fixture tagline.',
    status: 'Released',
    original_language: 'en',
    genres,
    ...(type === 'movie'
      ? { runtime: 118 }
      : {
          episode_run_time: [45],
          number_of_seasons: 2,
          seasons: [
            { season_number: 0, name: 'Specials', episode_count: 1 },
            { season_number: 1, name: 'Season 1', episode_count: 3 },
            { season_number: 2, name: 'Season 2', episode_count: 2 },
          ],
        }),
    credits: {
      cast: [
        { name: 'Ada Fixture', character: 'Lead' },
        { name: 'Ben Placeholder', character: 'Friend' },
      ],
      crew: [{ name: 'Cleo Director', job: 'Director' }],
    },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'fixture-key' }] },
    similar: { results: pool.filter((r) => r.id !== id).slice(0, 6) },
  };
};

const season = (n) => ({
  season_number: n,
  episodes: Array.from({ length: n === 1 ? 3 : 2 }, (_, i) => ({
    episode_number: i + 1,
    name: `Episode ${i + 1}`,
    air_date: `2020-0${n}-0${i + 1}`,
    overview: `Fixture episode ${i + 1} of season ${n}.`,
  })),
});

const search = (q) => {
  const needle = q.toLowerCase();
  const hit = (name) => name.toLowerCase().includes(needle);
  return page([
    ...MOVIES.filter((m) => hit(m.title)).map((m) => ({ ...m, media_type: 'movie' })),
    ...SHOWS.filter((s) => hit(s.name)).map((s) => ({ ...s, media_type: 'tv' })),
    // The API keeps movies and series only.
    ...(hit('fixture') ? [{ id: 1, name: 'Ada Fixture', media_type: 'person' }] : []),
  ]);
};

/** The JSON for a TMDB path (without the /3 prefix), or a status code. */
export function route(path, query) {
  let m;
  if ((m = /^\/genre\/(movie|tv)\/list$/.exec(path))) {
    return { genres: m[1] === 'movie' ? MOVIE_GENRES : TV_GENRES };
  }
  if ((m = /^\/trending\/(movie|tv)\/week$/.exec(path))) {
    return page(m[1] === 'movie' ? MOVIES : SHOWS);
  }
  if ((m = /^\/(movie|tv)\/(popular|top_rated|now_playing|on_the_air)$/.exec(path))) {
    return page(m[1] === 'movie' ? MOVIES : SHOWS);
  }
  if ((m = /^\/discover\/(movie|tv)$/.exec(path))) {
    const genre = Number(query.get('with_genres'));
    const pool = m[1] === 'movie' ? MOVIES : SHOWS;
    return page(pool.filter((r) => !genre || r.genre_ids.includes(genre)));
  }
  if (path === '/search/multi') return search(query.get('query') ?? '');
  if ((m = /^\/tv\/(\d+)\/season\/(\d+)$/.exec(path))) {
    return detail('tv', Number(m[1])) ? season(Number(m[2])) : 404;
  }
  if ((m = /^\/(movie|tv)\/(\d+)$/.exec(path))) {
    const id = Number(m[2]);
    if (id === FAILING_ID) return 500;
    return detail(m[1], id) ?? 404;
  }
  return 404;
}

export function createStub() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const path = url.pathname.replace(/^\/3(?=\/)/, '');
    const out = route(path, url.searchParams);
    if (typeof out === 'number') {
      res.writeHead(out, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status_message: out === 404 ? 'Not found' : 'Stub failure' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? process.env.STUB_TMDB_PORT ?? 4010);
  createStub().listen(port, '127.0.0.1', () =>
    console.log(`stub TMDB on http://127.0.0.1:${port}`),
  );
}
