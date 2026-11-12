import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GenreCover, Paged, TitleSummary } from '../../core/models';
import HomePage from './home.page';

const title = (tmdbId: number, name: string, mediaType: 'movie' | 'tv'): TitleSummary => ({
  tmdbId,
  mediaType,
  title: name,
  year: 2024,
  rating: 7.4,
  posterUrl: `https://image.tmdb.org/t/p/w342/${tmdbId}.jpg`,
  backdropUrl: `https://image.tmdb.org/t/p/w1280/${tmdbId}.jpg`,
  overview: `${name} overview`,
});

const paged = (items: TitleSummary[]): Paged<TitleSummary> => ({
  items,
  page: 1,
  totalPages: 1,
  totalItems: items.length,
});

const trending = paged([1, 2, 3, 4].map((i) => title(i, `Trending ${i}`, 'movie')));
const newTv = paged([10, 11].map((i) => title(i, `Fresh ${i}`, 'tv')));
const topRated = paged([20, 21].map((i) => title(i, `Classic ${i}`, 'movie')));
const cover = (id: number) => `https://image.tmdb.org/t/p/w780/${id}.jpg`;
const genres: GenreCover[] = [
  { id: 878, name: 'Science Fiction', coverUrl: cover(878) },
  { id: 28, name: 'Action', coverUrl: cover(28) },
];
// TMDB's movie genre list comes back alphabetical, so the curated order must not follow API order.
const manyGenres: GenreCover[] = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
].map((name, i) => ({ id: 100 + i, name, coverUrl: cover(100 + i) }));

describe('HomePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    // jsdom has no layout, so p-carousel's observers and scrollTo are stubbed (it only needs them to exist).
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      value: () => undefined,
    });
    const observer = class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    };
    vi.stubGlobal('ResizeObserver', observer);
    vi.stubGlobal('IntersectionObserver', observer);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const request = (path: string, type: string) =>
    http.expectOne((r) => r.url === `/api/v1/catalog/${path}` && r.params.get('type') === type);

  function load() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges(); // starts the four requests; stability waits for them, so do not await it yet
    return fixture;
  }

  it('renders every row when all requests succeed', async () => {
    const fixture = load();
    request('trending', 'movie').flush(trending);
    request('new', 'tv').flush(newTv);
    request('top-rated', 'movie').flush(topRated);
    request('genre-covers', 'movie').flush(genres);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('cv-poster-row h2')).map((h) => h.textContent);
    expect(headings).toEqual([
      'Trending movies',
      'New release TV shows',
      'Popular genres',
      'Top rated films',
    ]);
    expect(el.querySelector('cv-hero [aria-label="1 of 3"]')?.textContent).toContain('Trending 1');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows an error block with Retry in one row when that request fails and still renders the others', async () => {
    const fixture = load();
    request('trending', 'movie').flush(trending);
    request('new', 'tv').flush(null, { status: 500, statusText: 'Server Error' });
    request('top-rated', 'movie').flush(topRated);
    request('genre-covers', 'movie').flush(genres);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const retryButtons = () =>
      Array.from(el.querySelectorAll('button')).filter((b) => b.textContent?.includes('Retry'));
    expect(retryButtons().length).toBe(1);
    expect(Array.from(el.querySelectorAll('cv-poster-row h2')).map((h) => h.textContent)).toEqual([
      'Trending movies',
      'Popular genres',
      'Top rated films',
    ]);
    expect(el.textContent).toContain('New release TV shows'); // the failed row keeps its heading

    retryButtons()[0].click();
    fixture.detectChanges();
    request('new', 'tv').flush(newTv);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('cv-poster-row').length).toBe(4);
  });

  describe('Popular genres', () => {
    let fixture: ComponentFixture<HomePage>;
    async function loadGenres(response: GenreCover[]) {
      fixture = load();
      request('trending', 'movie').flush(trending);
      request('new', 'tv').flush(newTv);
      request('top-rated', 'movie').flush(topRated);
      request('genre-covers', 'movie').flush(response);
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }
    const region = (el: HTMLElement) =>
      el.querySelector('[role="region"][aria-label="Popular genres"]');
    const tiles = (el: HTMLElement) =>
      Array.from(region(el)?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const text = (a: HTMLAnchorElement) => a.textContent?.replace(/\s+/g, ' ').trim();

    it('shows "Popular genres" and no "Browse genres" grid', async () => {
      const el = await loadGenres(manyGenres);
      const headings = Array.from(el.querySelectorAll('h2')).map((h) => h.textContent?.trim());
      expect(headings).toContain('Popular genres');
      expect(headings).not.toContain('Browse genres');
      expect(el.textContent).not.toContain('Browse genres');
    });

    it('shows at most 10 tiles in curated order, labelling Science Fiction "Sci-Fi"', async () => {
      const el = await loadGenres(manyGenres);
      const row = tiles(el);
      expect(row.map(text)).toEqual([
        'Sci-FiScience Fiction', // visible short label plus the real name for assistive tech
        'Action',
        'Drama',
        'Fantasy',
        'Thriller',
        'Comedy',
        'Adventure',
        'Animation',
        'Horror',
        'Romance',
      ]);
      expect(row[0].querySelector('[aria-hidden="true"]')?.textContent).toBe('Sci-Fi');
      expect(row[0].querySelector('.sr-only')?.textContent).toBe('Science Fiction');
    });

    it('links each tile to its genre page', async () => {
      const el = await loadGenres(manyGenres);
      const hrefs = tiles(el).map((a) => a.getAttribute('href'));
      expect(hrefs[0]).toBe('/genre/movie/114'); // Science Fiction
      expect(hrefs[1]).toBe('/genre/movie/100'); // Action
      expect(hrefs.every((h) => /^\/genre\/movie\/\d+$/.test(h ?? ''))).toBe(true);
    });

    it('links "See all" to the Movies page, which lists every genre', async () => {
      const el = await loadGenres(manyGenres);
      const seeAll = Array.from(
        region(el)?.closest('section')?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
      ).find((a) => a.textContent?.includes('See all'));
      expect(seeAll?.getAttribute('href')).toBe('/movies');
    });

    it('skips curated names the API does not have', async () => {
      const el = await loadGenres(
        manyGenres.filter((g) => !['Drama', 'Thriller', 'Horror'].includes(g.name)),
      );
      const labels = tiles(el).map(text);
      expect(labels.slice(0, 4)).toEqual(['Sci-FiScience Fiction', 'Action', 'Fantasy', 'Comedy']);
      expect(labels).not.toContain('Drama');
    });

    it('falls back to the first genres in API order when fewer than 6 curated names match', async () => {
      const el = await loadGenres([
        { id: 1, name: 'Zeta', coverUrl: null },
        { id: 2, name: 'Action', coverUrl: null },
        { id: 3, name: 'Alpha', coverUrl: null },
        { id: 4, name: 'Drama', coverUrl: null },
      ]);
      expect(tiles(el).map((a) => a.getAttribute('href'))).toEqual([
        '/genre/movie/1',
        '/genre/movie/2',
        '/genre/movie/3',
        '/genre/movie/4',
      ]);
    });

    describe('cover images', () => {
      const img = (a: HTMLAnchorElement) => a.querySelector('img');

      it('renders a decorative, lazy cover image with the coverUrl in each tile', async () => {
        const row = tiles(await loadGenres(manyGenres));
        const first = img(row[0]);
        expect(first?.getAttribute('src')).toBe(cover(114)); // Science Fiction
        expect(first?.getAttribute('alt')).toBe('');
        expect(first?.getAttribute('loading')).toBe('lazy');
        expect(first?.getAttribute('decoding')).toBe('async');

        expect(row.every((a) => img(a))).toBe(true);
      });

      it('shows no image when coverUrl is null and keeps the tile usable', async () => {
        const el = await loadGenres(
          manyGenres.map((g) => (g.name === 'Action' ? { ...g, coverUrl: null } : g)),
        );
        const row = tiles(el);
        expect(img(row[1])).toBeNull(); // Action
        expect(img(row[0])).not.toBeNull();
        expect(text(row[1])).toBe('Action');
        expect(row[1].getAttribute('href')).toBe('/genre/movie/100');
      });

      it('drops only the failed image, leaving the tonal tile with its label and link', async () => {
        const el = await loadGenres(manyGenres);
        const row = tiles(el);
        img(row[1])?.dispatchEvent(new Event('error')); // Action
        fixture.detectChanges();

        expect(img(row[1])).toBeNull();
        expect(text(row[1])).toBe('Action');
        expect(row[1].getAttribute('href')).toBe('/genre/movie/100');
        expect(img(row[0])).not.toBeNull();
      });

      it('keeps the cover hidden over the tonal tile until it has loaded, then fades it in', async () => {
        const first = img(tiles(await loadGenres(manyGenres))[0]);
        const layer = first?.parentElement;
        expect(layer?.classList).toContain('opacity-0');
        first?.dispatchEvent(new Event('load'));
        fixture.detectChanges();
        expect(layer?.classList).not.toContain('opacity-0');
      });

      describe('covers that settled before the client took over (SSR hydration)', () => {
        // The browser fires load/error before hydration attaches listeners; only the img state is left.
        function stubImage(complete: boolean, naturalWidth: number) {
          vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(complete);
          vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(naturalWidth);
        }

        it('shows a cover that had already loaded, without waiting for a load event', async () => {
          stubImage(true, 780);
          const row = tiles(await loadGenres(manyGenres));
          expect(img(row[0])?.parentElement?.classList).not.toContain('opacity-0');
        });

        it('drops a cover that had already failed, leaving the tonal tile', async () => {
          stubImage(true, 0);
          const row = tiles(await loadGenres(manyGenres));
          expect(img(row[0])).toBeNull();
          expect(text(row[0])).toBe('Sci-FiScience Fiction');
        });
      });

      it('makes a single genre request on Home, and none to the plain genre list', async () => {
        await loadGenres(manyGenres);
        http.expectNone((r) => r.url === '/api/v1/catalog/genres');
      });
    });

    it('renders no section at all when the API returns no genres', async () => {
      const el = await loadGenres([]);
      expect(el.textContent).not.toContain('Popular genres');
      expect(region(el)).toBeNull();
    });

    it('shows the heading and a skeleton row while the genres load', () => {
      const fixture = load(); // nothing flushed yet
      const el = fixture.nativeElement as HTMLElement;
      const section = Array.from(el.querySelectorAll('section')).find((s) =>
        s.querySelector('h2')?.textContent?.includes('Popular genres'),
      );
      expect(section?.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
      expect(section?.querySelectorAll('p-skeleton').length).toBeGreaterThanOrEqual(4);
      expect(tiles(el).length).toBe(0);
      // settle the pending requests so http.verify() is happy
      request('trending', 'movie');
      request('new', 'tv');
      request('top-rated', 'movie');
      request('genre-covers', 'movie');
    });

    it('shows an error block with Retry when genres fail and the rest of Home still renders', async () => {
      const fixture = load();
      request('trending', 'movie').flush(trending);
      request('new', 'tv').flush(newTv);
      request('top-rated', 'movie').flush(topRated);
      request('genre-covers', 'movie').flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const retry = () =>
        Array.from(el.querySelectorAll('button')).filter((b) => b.textContent?.includes('Retry'));
      expect(retry().length).toBe(1);
      expect(el.textContent).toContain('Could not load genres');
      expect(el.textContent).toContain('Popular genres');
      expect(Array.from(el.querySelectorAll('cv-poster-row h2')).map((h) => h.textContent)).toEqual(
        ['Trending movies', 'New release TV shows', 'Top rated films'],
      );

      retry()[0].click();
      fixture.detectChanges();
      request('genre-covers', 'movie').flush(manyGenres);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelector('[role="alert"]')).toBeNull();
      expect(tiles(el).length).toBe(10);
    });
  });
});
