import { RESPONSE_INIT } from '@angular/core';
import { Route } from '@angular/router';
import { setup } from './features/browse/browse.testing';
import { routes } from './app.routes';

/** The routes that name themselves through SeoService (their head depends on their data). */
const SELF_TITLED = ['', 'genre/:type/:id', 'search', 'title/:type/:id', '**'];
const PRIVATE = [
  'login',
  'register',
  'forgot-password',
  'check-email',
  'verify-email',
  'reset-password',
  'dashboard',
  'admin',
];

describe('route table', () => {
  const leaves = (list: Route[]): Route[] =>
    list.flatMap((r) => (r.children?.length ? leaves(r.children) : [r]));

  it('gives every route a document title, or lets the page set one', () => {
    for (const route of routes) {
      const named = route.title !== undefined || SELF_TITLED.includes(route.path ?? '');
      const children = leaves(route.children ?? []).filter((c) => c.redirectTo === undefined);
      expect(named || children.every((c) => c.title !== undefined), route.path).toBe(true);
    }
  });

  it('marks the private and utility pages noindex, and no public page', () => {
    for (const route of routes) {
      expect(route.data?.['noindex'] === true, route.path).toBe(PRIVATE.includes(route.path ?? ''));
    }
  });
});

describe('document titles', () => {
  afterEach(() => {
    document.head
      .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
      .forEach((e) => e.remove());
  });

  it.each([
    ['/new', 'New & Popular | Cinevault'],
    ['/terms', 'Terms | Cinevault'],
    ['/privacy', 'Privacy | Cinevault'],
  ])('%s is titled "%s"', async (url, title) => {
    await setup(url); // the page's own requests stay open: only the head is checked

    expect(document.title).toBe(title);
  });

  it('answers an unknown path with 404, no-store and the Not found page', async () => {
    const init: ResponseInit = { status: 200, headers: new Headers() };
    const { el } = await setup('/no-such-page', [{ provide: RESPONSE_INIT, useValue: init }]);

    expect(el.querySelector('h1')?.textContent).toBe('Page not found');
    expect(init.status).toBe(404);
    expect(new Headers(init.headers).get('Cache-Control')).toBe('no-store');
    expect(document.title).toBe('Page not found | Cinevault');
  });
});
