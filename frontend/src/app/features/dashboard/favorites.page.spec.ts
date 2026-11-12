import { TestBed } from '@angular/core/testing';
import { fav, paged, setup } from './dashboard.testing';

const ok = { status: 204, statusText: 'No Content' };

describe('Favorites page', () => {
  beforeEach(() => {
    // jsdom has no layout; paging scrolls to the top
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  const removeButton = (el: HTMLElement, title: string) =>
    el.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${title} from favorites"]`);

  it('unavailable favorite shows the Unavailable title label', async () => {
    const { el, list, settle, http } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush(
      paged([
        fav(1, { title: 'Alien' }),
        fav(2, { title: 'Unavailable title', year: null, unavailable: true }),
      ]),
    );
    await settle();

    // Only the available title is a link to its page; the unavailable one has a Remove action instead.
    expect(el.querySelectorAll('a[href^="/title/"]')).toHaveLength(1);
    expect(el.textContent).toContain('Unavailable title');
    const remove = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Remove',
    );
    expect(remove).toBeDefined();
    http.verify();
  });

  it('Favorites empty state links to Home', async () => {
    const { el, list, settle, http } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush({ items: [], page: 1, totalPages: 0, totalItems: 0 });
    await settle();

    expect(el.textContent).toContain('You have not saved anything yet.');
    const browse = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Browse trending'),
    );
    expect(browse?.getAttribute('href')).toBe('/');
    expect(el.querySelector('cv-paginator nav')).toBeNull();
    http.verify();
  });

  it('shows nothing user specific while the list is loading', async () => {
    const { el, list, http, settle } = await setup('/dashboard/favorites');
    expect(el.textContent).not.toContain('You have not saved anything yet.');
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    (await list({ page: '1' })).flush(paged([]));
    await settle();
    http.verify();
  });

  it('asks for the type and page from the URL and treats an unknown type as All', async () => {
    const { list, settle, http } = await setup('/dashboard/favorites?type=tv&page=2');
    (await list({ type: 'tv', page: '2' })).flush(paged([fav(1, { mediaType: 'tv' })], 2, 3));
    await settle();
    http.verify();
    TestBed.resetTestingModule();

    const other = await setup('/dashboard/favorites?type=nope&page=abc');
    (await other.list({ type: null, page: '1' })).flush(paged([]));
    await other.settle();
    other.http.verify();
  });

  it('filters through the URL: the Series button puts type=tv in it and resets the page', async () => {
    const { el, list, settle, http, url } = await setup('/dashboard/favorites?page=2');
    (await list({ page: '2' })).flush(paged([fav(1)], 2, 3));
    await settle();

    const series = el.querySelector<HTMLElement>('p-togglebutton[aria-label="Series"]')!;
    series.click();
    (await list({ type: 'tv', page: '1' })).flush(paged([fav(7, { mediaType: 'tv' })]));
    await settle();
    expect(url()).toBe('/dashboard/favorites?type=tv');
    http.verify();
  });

  it('removing a title hides it and shows a toast whose Undo brings it back without a request', async () => {
    const { el, list, settle, http } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([fav(1), fav(2)]));
    await settle();

    removeButton(el, 'Title 1')!.click();
    await settle();
    expect(removeButton(el, 'Title 1')).toBeNull();
    const undo = await vi.waitFor(() => {
      const b = el.querySelector<HTMLButtonElement>('[data-undo] button');
      expect(b).not.toBeNull();
      return b!;
    });
    expect(el.textContent).toContain('Removed Title 1 from favorites.');

    undo.click();
    await settle();
    expect(removeButton(el, 'Title 1')).not.toBeNull();
    expect(el.querySelector('[data-undo]')).toBeNull();
    http.expectNone('/api/v1/me/favorites/movie/1');
    http.verify();
  });

  it('sends the DELETE when the user leaves the page with a removal pending', async () => {
    const { el, list, settle, http, harness } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([fav(1)]));
    await settle();
    removeButton(el, 'Title 1')!.click();
    await settle();

    await harness.navigateByUrl('/dashboard/account');
    harness.detectChanges();
    http.expectOne({ method: 'DELETE', url: '/api/v1/me/favorites/movie/1' }).flush(null, ok);
    await settle();
    http.verify();
  });

  it('moves focus to Undo after a removal so the keyboard can use it', async () => {
    const { el, list, settle, http } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([fav(1)]));
    await settle();
    removeButton(el, 'Title 1')!.click();
    await vi.waitFor(() => {
      expect(document.activeElement?.textContent).toContain('Undo');
    });
    http.match('/api/v1/me/favorites/movie/1');
  });

  it('steps back to the last page when the removal leaves the current page empty', async () => {
    const { el, list, settle, http, url } = await setup('/dashboard/favorites?page=2');
    (await list({ page: '2' })).flush(paged([fav(21)], 2, 2));
    await settle();
    // Only the 5 s undo timer is faked; the click starts it.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      el.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove Title 21 from favorites"]',
      )!.click();
      vi.advanceTimersByTime(5_000);
    } finally {
      vi.useRealTimers();
    }
    http
      .expectOne({ method: 'DELETE', url: '/api/v1/me/favorites/movie/21' })
      .flush(null, { status: 204, statusText: 'No Content' });
    // Page 2 is now past the end (one page left): the page asks for page 1 and the URL follows.
    (await list({ page: '2' })).flush({ items: [], page: 2, totalPages: 1, totalItems: 20 });
    (await list({ page: '1' })).flush(paged([fav(1)], 1, 1));
    await settle();
    expect(url()).toBe('/dashboard/favorites');
    expect(el.textContent).not.toContain('No favorites on this page.');
    expect(document.activeElement?.tagName).toBe('H1'); // focus stays on the page, not lost to the body
    http.verify();
  });

  it('shows an error with Retry when the list cannot be loaded', async () => {
    const { el, list, settle, http } = await setup('/dashboard/favorites');
    (await list({ page: '1' })).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(el.textContent).toContain('Could not load your favorites');
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    (await list({ page: '1' })).flush(paged([fav(1)]));
    await settle();
    expect(removeButton(el, 'Title 1')).not.toBeNull();
    http.verify();
  });
});
