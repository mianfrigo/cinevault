import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { FavoritesStore } from '../../core/favorites/favorites.store';
import { TitleDetail } from '../../core/models';
import { setup } from '../browse/browse.testing';
import { movie, season1, series } from './title.testing';

@Component({ imports: [ToastModule], template: '<p-toast />' })
class ToastHost {}

const config = (downloadButton: boolean) => ({ features: { downloadButton } });
const fail = (status: number, code: string) => ({
  status,
  statusText: code,
  // the shape the backend sends (ApiError)
  body: { statusCode: status, code, message: code },
});

describe('Title page', () => {
  beforeEach(() => {
    // jsdom has no layout: p-carousel's observers, Element.scrollTo and window.scrollTo are stubbed
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
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Opens /title/<type>/<id>, answers the detail request (and the config request) and settles. */
  async function open(
    detail: TitleDetail | { status: number; code: string },
    flags = config(false),
    url = '/title/movie/603',
  ) {
    const ctx = await setup(url, [MessageService]);
    ctx.http.expectOne('/api/v1/config').flush(flags);
    const path = url.replace('/title/', '');
    const req = ctx.request(path, {});
    if ('code' in detail) {
      const f = fail(detail.status, detail.code);
      req.flush(f.body, { status: f.status, statusText: f.statusText });
    } else {
      req.flush(detail);
    }
    await ctx.settle();
    return ctx;
  }

  it('renders the movie: heading, meta line, genre links, overview, cast, facts and similar row', async () => {
    const { el, http } = await open(movie);
    expect(el.querySelector('h1')?.textContent).toContain('The Matrix');
    const meta = el.querySelector('[data-testid="meta"]')?.textContent ?? '';
    expect(meta).toContain('8.2');
    expect(meta).toContain('1999');
    expect(meta).toContain('2h 16m');
    expect(meta).toContain('Movie');
    expect(el.querySelector('a[href="/genre/movie/878"]')?.textContent).toContain(
      'Science Fiction',
    );
    expect(el.textContent).toContain('A hacker learns the world is a simulation.');
    const cast = Array.from(el.querySelectorAll('[data-testid="cast"] li'));
    expect(cast).toHaveLength(3);
    expect(cast[0].textContent).toContain('Keanu Reeves');
    expect(cast[0].textContent).toContain('Neo');
    expect(cast[0].querySelector('p-avatar')?.textContent?.trim()).toBe('KR');
    expect(el.querySelector('[data-testid="facts"]')?.textContent).toContain('Lana Wachowski');
    expect(el.querySelector('cv-poster-row h2')?.textContent).toContain('More like this');
    expect(el.querySelector('cv-seasons')).toBeNull();
    http.verify();
  });

  it('shows "N seasons" for a series and loads the first season only', async () => {
    const { http, el, request, next, settle } = await setup('/title/tv/1399', [MessageService]);
    http.expectOne('/api/v1/config').flush(config(false));
    request('tv/1399', {}).flush(series);
    // the first panel is open, so its episodes are requested (settling would wait on that request)
    (await next('tv/1399/season/1', {})).flush(season1);
    await settle();
    http.expectNone((r) => r.url.endsWith('/season/2'));
    expect(el.querySelector('[data-testid="meta"]')?.textContent).toContain('2 seasons');
    expect(el.querySelector('[data-testid="meta"]')?.textContent).toContain('Series');
    expect(el.textContent).toContain('Winter-over');
    http.verify();
  });

  it('Download button is not rendered when the flag is false and is rendered when true', async () => {
    const off = await open(movie, config(false));
    expect(off.el.textContent).not.toContain('Download');
    expect(off.el.textContent).not.toContain('Hidden in production');
    TestBed.resetTestingModule();

    const on = await open(movie, config(true));
    const button = Array.from(on.el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Download'),
    );
    expect(button).toBeDefined();
    expect(on.el.textContent).toContain('Hidden in production');
    // the caption describes the button for assistive tech
    const described = button!.getAttribute('aria-describedby');
    expect(on.el.querySelector(`#${described}`)?.textContent).toContain('Hidden in production');
  });

  it('clicking Download shows the coming-soon toast and makes no HTTP request', async () => {
    const { el, http, settle } = await open(movie, config(true));
    const host = TestBed.createComponent(ToastHost);
    host.detectChanges();

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Download'))!
      .click();
    await vi.waitFor(() => {
      host.detectChanges();
      expect(host.nativeElement.textContent).toContain('Download is coming soon');
    });
    await settle();
    http.verify(); // nothing outstanding
    http.expectNone(() => true);
  });

  it('Title page for a movie with null runtime, overview and trailer renders without "undefined" or "null" text', async () => {
    const bare: TitleDetail = {
      ...movie,
      runtimeMinutes: null,
      overview: null,
      tagline: null,
      trailerUrl: null,
      posterUrl: null,
      backdropUrl: null,
      rating: null,
      year: null,
      status: null,
      originalLanguage: null,
      director: null,
      genres: [],
      cast: [{ name: 'Someone', character: null }],
      similar: [],
    };
    const { el } = await open(bare, config(true));
    const text = el.textContent ?? '';
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).toContain('No overview available.');
    expect(el.querySelector('a[href*="youtube"]')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toContain('The Matrix');
    expect(el.querySelector('cv-poster-row')).toBeNull();
  });

  it('links Watch trailer to the trailer in a new tab', async () => {
    const { el } = await open(movie);
    const link = el.querySelector<HTMLAnchorElement>('a[href^="https://www.youtube.com/watch"]');
    expect(link?.textContent).toContain('Watch trailer');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('toggles My List through the favorites store', async () => {
    const { el } = await open(movie);
    const toggle = vi.spyOn(TestBed.inject(FavoritesStore), 'toggle').mockResolvedValue();
    el.querySelector<HTMLButtonElement>('button[aria-pressed]')!.click();
    expect(toggle).toHaveBeenCalledWith('movie', 603);
  });

  it('Title page shows the Not found state for a 404', async () => {
    const { el, http } = await open({ status: 404, code: 'NOT_FOUND' });
    expect(el.textContent).toContain('not found');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('h1')?.textContent).toMatch(/not found/i);
    http.verify();
  });

  it('shows the Not found state without a request for a malformed route', async () => {
    const { el, http } = await setup('/title/film/abc', [MessageService]);
    http.expectOne('/api/v1/config').flush(config(false));
    http.expectNone((r) => r.url.includes('/catalog/'));
    expect(el.querySelector('h1')?.textContent).toMatch(/not found/i);
  });

  it('Title page shows an error with Retry on 502', async () => {
    const { el, settle, next, http } = await open({ status: 502, code: 'TMDB_UNAVAILABLE' });
    // the request failed and the page still renders (value() throws in the error state)
    const alert = el.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Retry'))!
      .click();
    (await next('movie/603', {})).flush(movie);
    await settle();
    expect(el.querySelector('h1')?.textContent).toContain('The Matrix');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    http.verify();
  });

  it('loads the next title when the route changes, without keeping the previous one', async () => {
    const { el, settle, next, http } = await open(movie);
    const harnessEl = el;
    const link = harnessEl.querySelector<HTMLAnchorElement>(
      'cv-poster-row a[href="/title/movie/604"]',
    );
    expect(link).not.toBeNull();
    link!.click();
    const req = await next('movie/604', {});
    expect(harnessEl.querySelector('h1')).toBeNull();
    req.flush({ ...movie, tmdbId: 604, title: 'The Matrix Reloaded' });
    await settle();
    expect(harnessEl.querySelector('h1')?.textContent).toContain('The Matrix Reloaded');
    http.verify();
  });
});
