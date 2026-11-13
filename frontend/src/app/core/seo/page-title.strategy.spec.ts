import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { PageTitleStrategy } from './page-title.strategy';
import { SITE_ORIGIN } from './site-origin';

const stub = () => import('../../pages/placeholder.component');

describe('PageTitleStrategy', () => {
  let router: Router;
  let doc: Document;
  const robots = () => doc.head.querySelector('meta[name="robots"]')?.getAttribute('content');
  const canonical = () => doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: SITE_ORIGIN, useValue: 'https://cinevault.test' },
        { provide: TitleStrategy, useExisting: PageTitleStrategy },
        provideRouter([
          { path: 'movies', title: 'Movies', loadComponent: stub },
          { path: 'login', title: 'Log in', data: { noindex: true }, loadComponent: stub },
          {
            path: 'dashboard',
            data: { noindex: true },
            loadComponent: stub,
            children: [{ path: 'favorites', title: 'My favorites', loadComponent: stub }],
          },
          { path: 'self-titled', loadComponent: stub },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    doc = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    doc.head
      .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
      .forEach((el) => el.remove());
  });

  it('titles a public route "{title} | Cinevault" with a canonical link and no robots tag', async () => {
    await router.navigateByUrl('/movies?page=2');

    expect(doc.title).toBe('Movies | Cinevault');
    expect(canonical()).toBe('https://cinevault.test/movies');
    expect(robots()).toBeUndefined();
  });

  it('marks a utility route noindex', async () => {
    await router.navigateByUrl('/login');

    expect(doc.title).toBe('Log in | Cinevault');
    expect(robots()).toBe('noindex, nofollow');
    expect(canonical()).toBeUndefined();
  });

  it('marks the children of a noindex parent route noindex, and clears it on a public route', async () => {
    await router.navigateByUrl('/dashboard/favorites');
    expect(doc.title).toBe('My favorites | Cinevault');
    expect(robots()).toBe('noindex, nofollow');

    await router.navigateByUrl('/movies');
    expect(robots()).toBeUndefined();
  });

  it('leaves a route without a title to its page', async () => {
    doc.title = 'Set by the page';
    await router.navigateByUrl('/self-titled');

    expect(doc.title).toBe('Set by the page');
  });
});
