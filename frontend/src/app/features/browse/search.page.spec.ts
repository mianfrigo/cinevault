import { TestBed } from '@angular/core/testing';
import { paged, setup, title } from './browse.testing';

describe('Search page', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('Search page with no results shows the empty state containing the query', async () => {
    const { http, el, settle, request } = await setup('/search?q=zzxq');
    request('search', { q: 'zzxq', page: '1' }).flush(paged([], 1, 0));
    await settle();
    expect(el.textContent).toContain('No titles match');
    expect(el.textContent).toContain('zzxq');
    expect(el.querySelector('nav[aria-label="Pagination"]')).toBeNull();
    http.verify();
  });

  it('titles the page "Search: {q}" and keeps markup in the query as text', async () => {
    const { http, el, settle, request } = await setup('/search?q=%3Cb%3Edune%3C%2Fb%3E');
    request('search', { q: '<b>dune</b>', page: '1' }).flush(paged([], 1, 0));
    await settle();

    expect(document.title).toBe('Search: <b>dune</b> | Cinevault');
    expect(document.head.querySelector('b')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toMatch(
      /\/search\?q=%3Cb%3Edune%3C%2Fb%3E$/,
    );
    expect(el.querySelector('b')).toBeNull();
    http.verify();
  });

  it('titles a search without a query "Search | Cinevault"', async () => {
    const { http, settle } = await setup('/search');
    await settle();

    expect(document.title).toBe('Search | Cinevault');
    http.verify();
  });

  it('Search page with q missing shows the prompt state and makes no request', async () => {
    for (const url of ['/search', '/search?q=', '/search?q=%20%20']) {
      const { http, el, settle, none } = await setup(url);
      await settle();
      none('search');
      expect(el.textContent).toContain('Type a title');
      http.verify();
      TestBed.resetTestingModule();
    }
  });

  it('shows the results for q and requests the page from the query param', async () => {
    const { http, el, settle, request } = await setup('/search?q=blade%20runner&page=2');
    request('search', { q: 'blade runner', page: '2' }).flush(
      paged([title(1, 'Blade Runner'), title(2, 'Blade Runner 2049')], 2, 6),
    );
    await settle();
    expect(el.querySelector('h1')?.textContent).toContain('blade runner');
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(2);
    expect(el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('2');
    http.verify();
  });

  it('trims q and sends at most 100 characters, which the backend would otherwise reject', async () => {
    const { http, el, settle, request } = await setup(`/search?q=%20${'a'.repeat(150)}`);
    request('search', { q: 'a'.repeat(100), page: '1' }).flush(paged([title(1)]));
    await settle();
    expect(el.textContent).toContain('first 100 characters');
    http.verify();
  });

  it('cuts a long query at a code point boundary within 100 UTF-16 units', async () => {
    const { el, settle, request } = await setup(`/search?q=${encodeURIComponent('😀'.repeat(80))}`);
    request('search', { q: '😀'.repeat(50), page: '1' }).flush(paged([title(1)]));
    await settle();
    expect(el.querySelector('h1')?.classList.contains('break-words')).toBe(true);
  });

  it('beyond the last page shows neutral copy, not "No titles match", and highlights no page', async () => {
    const { el, settle, request } = await setup('/search?q=heat&page=50');
    request('search', { q: 'heat', page: '50' }).flush(paged([], 50, 6));
    await settle();
    expect(el.textContent).not.toContain('No titles match');
    expect(el.textContent).toContain('No titles on this page');
    expect(el.querySelector('nav [aria-current="page"]')).toBeNull();
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!.disabled).toBe(true);
  });

  it('keeps the previous results and the focused paginator button while the next page loads', async () => {
    const { el, settle, request, next } = await setup('/search?q=heat');
    request('search', { q: 'heat', page: '1' }).flush(paged([title(1), title(2)], 1, 4));
    await settle();
    const button = el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!;
    button.focus();
    button.click();
    const second = await next('search', { q: 'heat', page: '2' });
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(2);
    expect(document.activeElement).toBe(button);
    second.flush(paged([title(3)], 2, 4));
    await settle();
    expect(document.activeElement).toBe(button);
  });

  it('puts the page in the URL and keeps q when the paginator is used', async () => {
    const { el, settle, request, next, url } = await setup('/search?q=heat');
    request('search', { q: 'heat', page: '1' }).flush(paged([title(1)], 1, 4));
    await settle();
    el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    (await next('search', { q: 'heat', page: '2' })).flush(paged([title(2)], 2, 4));
    await settle();
    expect(url()).toBe('/search?q=heat&page=2');
  });

  it('shows an error with Retry', async () => {
    const { el, settle, request, next } = await setup('/search?q=heat');
    request('search', { q: 'heat', page: '1' }).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Retry'))!
      .click();
    (await next('search', { q: 'heat', page: '1' })).flush(paged([title(1)]));
    await settle();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
