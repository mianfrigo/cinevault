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

    const series = el.querySelector<HTMLElement>('p-togglebutton[aria-label^="Series"]')!;
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

  describe('lead, filter counts and cards', () => {
    const ids = [
      { mediaType: 'movie', tmdbId: 1 },
      { mediaType: 'movie', tmdbId: 2 },
      { mediaType: 'tv', tmdbId: 3 },
    ];

    /** The hearts store's ids request, answered with these favorites. */
    async function heartsLoad(ctx: Awaited<ReturnType<typeof setup>>, list = ids) {
      await vi.waitFor(() => ctx.http.expectOne('/api/v1/me/favorites/ids').flush(list));
      await ctx.harness.fixture.whenStable();
      ctx.harness.detectChanges();
    }
    const lead = (el: HTMLElement) => el.querySelector('header p')?.textContent?.trim();
    const pills = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('p-togglebutton')).map((b) => ({
        label: b.getAttribute('aria-label'),
        text: b.textContent?.replace(/\s+/g, ' ').trim(),
      }));

    it('shows no number until the hearts ids have loaded', async () => {
      const ctx = await setup('/dashboard/favorites');
      (await ctx.list({ page: '1' })).flush(paged([fav(1), fav(2)]));
      await ctx.harness.fixture.whenStable();
      ctx.harness.detectChanges();

      expect(lead(ctx.el)).toBe('');
      expect(pills(ctx.el).map((p) => p.text)).toEqual(['All', 'Movies', 'Series']);
      ctx.http.match(() => true);
    });

    it('shows the total as the lead and the counts on the pills, with accessible names', async () => {
      const ctx = await setup('/dashboard/favorites');
      (await ctx.list({ page: '1' })).flush(paged([fav(1), fav(2)]));
      await heartsLoad(ctx);

      expect(lead(ctx.el)).toBe('3 saved titles');
      expect(pills(ctx.el)).toEqual([
        { label: 'All, 3 titles', text: 'All 3' },
        { label: 'Movies, 2 titles', text: 'Movies 2' },
        { label: 'Series, 1 title', text: 'Series 1' },
      ]);
      ctx.http.match(() => true);
    });

    it('says "1 saved title" for one and "No saved titles yet" for none', async () => {
      const one = await setup('/dashboard/favorites');
      (await one.list({ page: '1' })).flush(paged([fav(1)]));
      await heartsLoad(one, [{ mediaType: 'movie', tmdbId: 1 }]);
      expect(lead(one.el)).toBe('1 saved title');
      one.http.match(() => true);
      TestBed.resetTestingModule();

      const none = await setup('/dashboard/favorites');
      (await none.list({ page: '1' })).flush(paged([]));
      await heartsLoad(none, []);
      expect(lead(none.el)).toBe('No saved titles yet');
      expect(pills(none.el).map((p) => p.text)).toEqual(['All 0', 'Movies 0', 'Series 0']);
      none.http.match(() => true);
    });

    it('counts a pending removal out at once, back in on Undo, and once after the DELETE', async () => {
      const ctx = await setup('/dashboard/favorites');
      (await ctx.list({ page: '1' })).flush(paged([fav(1), fav(2)]));
      await heartsLoad(ctx);
      const sidebar = () => ctx.harness.fixture.nativeElement.querySelector('aside').textContent;

      removeButton(ctx.el, 'Title 1')!.click();
      await ctx.settle();
      expect(lead(ctx.el)).toBe('2 saved titles');
      expect(pills(ctx.el).map((p) => p.text)).toEqual(['All 2', 'Movies 1', 'Series 1']);
      expect(sidebar()).toContain(', 2 saved titles');

      const undo = await vi.waitFor(() => {
        const b = ctx.el.querySelector<HTMLButtonElement>('[data-undo] button');
        expect(b).not.toBeNull();
        return b!;
      });
      undo.click();
      await ctx.settle();
      expect(lead(ctx.el)).toBe('3 saved titles');
      expect(pills(ctx.el).map((p) => p.text)).toEqual(['All 3', 'Movies 2', 'Series 1']);

      removeButton(ctx.el, 'Title 1')!.click();
      await ctx.settle();
      await ctx.harness.navigateByUrl('/dashboard/account'); // leaving sends the DELETE
      ctx.harness.detectChanges();
      ctx.http.expectOne({ method: 'DELETE', url: '/api/v1/me/favorites/movie/1' }).flush(null, ok);
      await ctx.settle();
      expect(sidebar()).toContain(', 2 saved titles');
      ctx.http.match(() => true);
    });

    it('counts a title again when its DELETE fails', async () => {
      const ctx = await setup('/dashboard/favorites');
      (await ctx.list({ page: '1' })).flush(paged([fav(1), fav(2)]));
      await heartsLoad(ctx);

      removeButton(ctx.el, 'Title 1')!.click();
      await ctx.settle();
      await ctx.harness.navigateByUrl('/dashboard/account');
      ctx.harness.detectChanges();
      ctx.http
        .expectOne({ method: 'DELETE', url: '/api/v1/me/favorites/movie/1' })
        .flush(null, { status: 500, statusText: 'Server Error' });
      await ctx.settle();
      expect(ctx.harness.fixture.nativeElement.querySelector('aside').textContent).toContain(
        ', 3 saved titles',
      );
      ctx.http.match(() => true);
    });

    it('draws each card with "year · type" at the left and the score at the right', async () => {
      const ctx = await setup('/dashboard/favorites');
      (await ctx.list({ page: '1' })).flush(
        paged([
          fav(1, { title: 'Alien', year: 1979, rating: 8.46 }),
          fav(2, { title: 'Dark', year: 2017, mediaType: 'tv', rating: null }),
        ]),
      );
      await ctx.settle();

      const metas = Array.from(ctx.el.querySelectorAll('[data-meta]')).map((m) =>
        m.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(metas).toEqual(['1979 · Movie8.5', '2017 · Series']);
      expect(ctx.el.textContent).not.toMatch(/null|undefined|NaN/);
      ctx.http.match(() => true);
    });

    it('keeps the grid shape while loading with placeholder cards and no text', async () => {
      const { el, list, settle, http } = await setup('/dashboard/favorites');
      const status = el.querySelector('[role="status"]')!;
      expect(status.querySelectorAll('p-skeleton').length).toBeGreaterThan(8);
      expect(status.textContent?.trim()).toBe('Loading');
      (await list({ page: '1' })).flush(paged([]));
      await settle();
      http.verify();
    });
  });
});
