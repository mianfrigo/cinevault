import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Genre } from '@core/models';
import { paged, setup, title } from './browse.testing';

const genres: Genre[] = [
  { id: 18, name: 'Drama' },
  { id: 878, name: 'Science Fiction' },
];

describe('Browse pages', () => {
  beforeEach(() => {
    // jsdom has no layout; paging scrolls to the top
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('Browse /movies uses the page query param', async () => {
    const { http, el, settle, request } = await setup('/movies?page=3');
    request('popular', { type: 'movie', page: '3' }).flush(
      paged([title(1, 'Alien'), title(2, 'Heat')], 3, 40),
    );
    request('genres', { type: 'movie' }).flush(genres);
    await settle();

    expect(el.querySelector('h1')?.textContent).toContain('Movies');
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(2);
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('a[href="/genre/movie/878"]')?.textContent).toContain(
      'Science Fiction',
    );
    http.verify();
  });

  it('titles /movies "Movies | Cinevault"', async () => {
    const { http, settle, request } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(paged([title(1)]));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();

    expect(document.title).toBe('Movies | Cinevault');
    http.verify();
  });

  it('titles a genre page after the genre once the list has loaded', async () => {
    const { http, settle, request } = await setup('/genre/movie/878');
    request('discover', { type: 'movie', genre: '878', page: '1' }).flush(paged([title(1)]));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();

    expect(document.title).toBe('Science Fiction | Cinevault');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
      /\/genre\/movie\/878$/,
    );
    http.verify();
  });

  it('answers 404 for a genre route that names no such catalog', async () => {
    const init: ResponseInit = { status: 200, headers: new Headers() };
    const { http, el } = await setup('/genre/book/9', [{ provide: RESPONSE_INIT, useValue: init }]);

    expect(init.status).toBe(404);
    expect(el.textContent).toContain('This genre does not exist');
    http.verify();
  });

  it('serves /tv from the tv catalog', async () => {
    const { http, settle, request } = await setup('/tv');
    request('popular', { type: 'tv', page: '1' }).flush(paged([title(5)]));
    request('genres', { type: 'tv' }).flush(genres);
    await settle();
    http.verify();
  });

  it('normalises a missing, non-numeric or out of range page before calling the API', async () => {
    for (const [raw, sent] of [
      ['page=abc', '1'],
      ['page=0', '1'],
      ['page=-2', '1'],
      ['page=9999', '500'],
    ]) {
      const { http, settle, request } = await setup(`/movies?${raw}`);
      request('popular', { type: 'movie', page: sent }).flush(paged([title(1)], 1, 3));
      request('genres', { type: 'movie' }).flush(genres);
      await settle();
      http.verify();
      TestBed.resetTestingModule();
    }
  });

  it('caps the paginator at 500 pages', async () => {
    const { el, settle, request } = await setup('/movies?page=2');
    request('popular', { type: 'movie', page: '2' }).flush(paged([title(1)], 2, 47000));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();
    const last = Array.from(el.querySelectorAll('nav li')).at(-1);
    expect(last?.textContent?.trim()).toBe('500');
  });

  it('shows the empty state and no paginator when the list is empty (totalPages 0)', async () => {
    const { el, settle, request } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(paged([], 1, 0));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();
    expect(el.textContent).toContain('No titles to show');
    expect(el.querySelector('nav[aria-label="Pagination"]')).toBeNull();
  });

  it('puts the page in the URL and requests it when the paginator is used', async () => {
    const { el, settle, request, next, url } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(paged([title(1)], 1, 9));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();

    el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    // the genres are not requested again, only the list
    (await next('popular', { type: 'movie', page: '2' })).flush(paged([title(2)], 2, 9));
    await settle();
    expect(url()).toBe('/movies?page=2');
    expect(window.scrollTo).toHaveBeenCalled();

    el.querySelector<HTMLButtonElement>('[aria-label="Page 1"]')!.click();
    (await next('popular', { type: 'movie', page: '1' })).flush(paged([title(1)], 1, 9));
    await settle();
    expect(url()).toBe('/movies'); // page 1 leaves the param out
  });

  it('keeps the grid and the focused paginator button while the next page loads', async () => {
    const { el, settle, request, next } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(paged([title(1), title(2)], 1, 9));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();

    const button = el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!;
    button.focus();
    button.click();
    const second = await next('popular', { type: 'movie', page: '2' });
    // the previous page stays on screen (dimmed, busy) and the focused button is not replaced
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(2);
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.isConnected).toBe(true);

    second.flush(paged([title(3), title(4), title(5)], 2, 9));
    await settle();
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(3);
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-current')).toBe('page');
  });

  it('drops the previous page and shows the error when the next page fails', async () => {
    const { el, settle, request, next } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(paged([title(1)], 1, 9));
    request('genres', { type: 'movie' }).flush(genres);
    await settle();
    el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    (await next('popular', { type: 'movie', page: '2' })).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(0);
  });

  it('shows an error with Retry that reloads the list', async () => {
    const { el, settle, request, next } = await setup('/movies');
    request('popular', { type: 'movie', page: '1' }).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    request('genres', { type: 'movie' }).flush(genres);
    await settle();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    const retry = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    )!;
    retry.click();
    (await next('popular', { type: 'movie', page: '1' })).flush(paged([title(1)]));
    await settle();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(1);
  });

  describe('Genre page', () => {
    it('Genre page reads type and id from the route and calls discover', async () => {
      const { http, el, settle, request } = await setup('/genre/tv/18?page=2');
      request('discover', { type: 'tv', genre: '18', page: '2' }).flush(
        paged([title(7, 'The Wire')], 2, 5),
      );
      request('genres', { type: 'tv' }).flush(genres);
      await settle();

      expect(el.querySelector('h1')?.textContent).toContain('Drama');
      expect(el.querySelectorAll('cv-poster-card')).toHaveLength(1);
      expect(el.querySelector('a[href="/genre/tv/18"]')?.getAttribute('aria-current')).toBe('page');
      http.verify();
    });

    it('still renders the grid with the fallback heading when only the genres request fails', async () => {
      const { el, settle, request } = await setup('/genre/tv/18');
      request('discover', { type: 'tv', genre: '18', page: '1' }).flush(
        paged([title(7, 'The Wire')], 1, 5),
      );
      request('genres', { type: 'tv' }).flush(null, { status: 500, statusText: 'Server Error' });
      await settle();
      expect(el.querySelector('h1')?.textContent).toContain('Genre');
      expect(el.querySelectorAll('cv-poster-card')).toHaveLength(1);
      expect(el.querySelector('nav[aria-label="Genres"]')).toBeNull();
    });

    it('makes no request for an unknown media type or a non-numeric genre id', async () => {
      for (const url of ['/genre/anime/18', '/genre/movie/abc', '/genre/movie/0']) {
        const { http, el, settle, none } = await setup(url);
        await settle();
        none('discover');
        none('genres');
        expect(el.textContent).toContain('genre does not exist');
        http.verify();
        TestBed.resetTestingModule();
      }
    });
  });
});
