import { TestBed } from '@angular/core/testing';
import { UserDto } from '@core/models';
import { fav, member, paged, setup } from './dashboard.testing';

const alex: UserDto = { ...member, name: 'Alex Mercer' };
const ids = [
  { mediaType: 'movie', tmdbId: 1 },
  { mediaType: 'movie', tmdbId: 2 },
  { mediaType: 'tv', tmdbId: 3 },
];

/** The shell is the host of the routed page: its element is the fixture's, not the page's. */
async function open(url: string, user: UserDto = alex) {
  const ctx = await setup(url, user);
  const shell = ctx.harness.fixture.nativeElement as HTMLElement;
  const sidebar = () => shell.querySelector('aside')!;
  const link = (label: string) =>
    Array.from(sidebar().querySelectorAll('nav a')).find((a) =>
      a.textContent?.trim().startsWith(label),
    ) as HTMLAnchorElement;
  /** Answers the hearts store's ids request with these favorites. */
  const heartsLoad = async (list = ids) => {
    await vi.waitFor(() => ctx.http.expectOne('/api/v1/me/favorites/ids').flush(list));
    await ctx.harness.fixture.whenStable();
    ctx.harness.detectChanges();
  };
  return { ...ctx, shell, sidebar, link, heartsLoad };
}

describe('Dashboard shell', () => {
  it('lists Favorites and Account in the sidebar and marks the current page', async () => {
    const { link, list, settle, http, harness } = await open('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([]));
    await settle();

    expect(link('Favorites').getAttribute('href')).toBe('/dashboard/favorites');
    expect(link('Favorites').getAttribute('aria-current')).toBe('page');
    expect(link('Account').getAttribute('href')).toBe('/dashboard/account');
    expect(link('Account').hasAttribute('aria-current')).toBe(false);

    await harness.navigateByUrl('/dashboard/account');
    harness.detectChanges();
    expect(link('Account').getAttribute('aria-current')).toBe('page');
    expect(link('Favorites').hasAttribute('aria-current')).toBe(false);
    http.match(() => true);
  });

  it('labels its landmarks and has one h1', async () => {
    const { shell, list, settle, http } = await open('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([]));
    await settle();

    expect(shell.querySelector('aside')?.getAttribute('aria-label')).toBe('Dashboard');
    const navs = Array.from(shell.querySelectorAll('nav')).map((n) => n.getAttribute('aria-label'));
    expect(navs).toEqual(['Dashboard sections', 'Dashboard (small screens)']);
    expect(shell.querySelectorAll('h1')).toHaveLength(1);
    http.match(() => true);
  });

  it('ends the sidebar with Back to site, Log out and the user block', async () => {
    const { sidebar, list, settle, http } = await open('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([]));
    await settle();

    const back = Array.from(sidebar().querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Back to site'),
    );
    expect(back?.getAttribute('href')).toBe('/');
    expect(
      Array.from(sidebar().querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Log out'),
      ),
    ).toBe(true);
    expect(sidebar().textContent).toContain('Alex Mercer');
    expect(sidebar().textContent).toContain('Member');
    expect(sidebar().querySelector('p-avatar')?.textContent?.trim()).toBe('AM');
    http.match(() => true);
  });

  it('shows Administrator for an admin and the first letter for a one word name', async () => {
    const { sidebar, list, settle, http } = await open('/dashboard/favorites', {
      ...member,
      name: 'Cher',
      role: 'ADMIN',
    });
    (await list({ page: '1' })).flush(paged([]));
    await settle();

    expect(sidebar().textContent).toContain('Administrator');
    expect(sidebar().querySelector('p-avatar')?.textContent?.trim()).toBe('C');
    http.match(() => true);
  });

  it('falls back to "A" for a name without letters', async () => {
    const { sidebar, list, settle, http } = await open('/dashboard/favorites', {
      ...member,
      name: '   ',
    });
    (await list({ page: '1' })).flush(paged([]));
    await settle();
    expect(sidebar().querySelector('p-avatar')?.textContent?.trim()).toBe('A');
    http.match(() => true);
  });

  it('shows no count on Favorites until the ids have loaded, then the total with accessible text', async () => {
    const { link, list, http, heartsLoad } = await open('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([fav(1)]));
    expect(link('Favorites').textContent).not.toMatch(/\d/);

    await heartsLoad();
    expect(link('Favorites').textContent).toContain('3');
    expect(link('Favorites').textContent).toContain(', 3 saved titles');
    http.match(() => true);
  });

  it('says "1 saved title" for one favorite and keeps 0 for none', async () => {
    const one = await open('/dashboard/favorites');
    (await one.list({ page: '1' })).flush(paged([fav(1)]));
    await one.heartsLoad([{ mediaType: 'movie', tmdbId: 1 }]);
    expect(one.link('Favorites').textContent).toContain(', 1 saved title');
    expect(one.link('Favorites').textContent).not.toContain('titles');
    one.http.match(() => true);
    TestBed.resetTestingModule();

    const none = await open('/dashboard/favorites');
    (await none.list({ page: '1' })).flush(paged([]));
    await none.heartsLoad([]);
    expect(none.link('Favorites').textContent).toContain(', 0 saved titles');
    none.http.match(() => true);
  });

  it('keeps the TMDB credit on the page', async () => {
    const { shell, list, settle, http } = await open('/dashboard/favorites');
    (await list({ page: '1' })).flush(paged([]));
    await settle();
    expect(shell.textContent).toContain(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    );
    http.match(() => true);
  });

  it('renders on the account page too, with its own h1', async () => {
    const { shell, link, http } = await open('/dashboard/account');
    expect(link('Account').getAttribute('aria-current')).toBe('page');
    expect(shell.querySelector('h1')?.textContent).toContain('Account');
    http.match(() => true);
  });
});
