import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Genre, Paged, TitleSummary } from '../../core/models';
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
const genres: Genre[] = [
  { id: 878, name: 'Science Fiction' },
  { id: 28, name: 'Action' },
];

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
  });

  const request = (path: string, type: string) =>
    http.expectOne((r) => r.url === `/api/v1/catalog/${path}` && r.params.get('type') === type);

  function load() {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges(); // starts the four requests; stability waits for them, so do not await it yet
    return fixture;
  }

  it('renders three rows when all requests succeed', async () => {
    const fixture = load();
    request('trending', 'movie').flush(trending);
    request('new', 'tv').flush(newTv);
    request('top-rated', 'movie').flush(topRated);
    request('genres', 'movie').flush(genres);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const headings = Array.from(el.querySelectorAll('cv-poster-row h2')).map((h) => h.textContent);
    expect(headings).toEqual(['Trending movies', 'New release TV shows', 'Top rated films']);
    expect(el.querySelector('cv-hero [aria-label="1 of 3"]')?.textContent).toContain('Trending 1');
    expect(el.querySelector('a[href="/genre/movie/878"]')?.textContent).toContain(
      'Science Fiction',
    );
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows an error block with Retry in one row when that request fails and still renders the others', async () => {
    const fixture = load();
    request('trending', 'movie').flush(trending);
    request('new', 'tv').flush(null, { status: 500, statusText: 'Server Error' });
    request('top-rated', 'movie').flush(topRated);
    request('genres', 'movie').flush(genres);
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const retryButtons = () =>
      Array.from(el.querySelectorAll('button')).filter((b) => b.textContent?.includes('Retry'));
    expect(retryButtons().length).toBe(1);
    expect(Array.from(el.querySelectorAll('cv-poster-row h2')).map((h) => h.textContent)).toEqual([
      'Trending movies',
      'Top rated films',
    ]);
    expect(el.textContent).toContain('New release TV shows'); // the failed row keeps its heading

    retryButtons()[0].click();
    fixture.detectChanges();
    request('new', 'tv').flush(newTv);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('cv-poster-row').length).toBe(3);
  });
});
