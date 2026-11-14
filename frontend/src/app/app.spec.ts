import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, withComponentInputBinding } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from './app';
import { routes } from './app.routes';
import { AuthStore } from '@core/auth/auth.store';
import { UserDto } from '@core/models';

@Component({ selector: 'cv-test-page', template: '<h1>Page</h1>' })
class TestPage {}

@Component({ selector: 'cv-test-parent', imports: [RouterOutlet], template: '<router-outlet />' })
class TestParent {}

function render() {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: '', component: TestPage },
        { path: 'auth', component: TestPage, data: { chromeless: true } },
        // A parent with a component and children, like the dashboard: the children do not inherit its data.
        {
          path: 'area',
          component: TestParent,
          data: { chromeless: true },
          children: [{ path: 'inner', component: TestPage }],
        },
      ]),
      MessageService,
    ],
  });
  return TestBed.createComponent(App);
}

describe('App', () => {
  it('renders the nav, the main landmark and the footer', async () => {
    const fixture = render();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('cv-nav')).not.toBeNull();
    expect(el.querySelector('main#main')).not.toBeNull();
    expect(el.querySelector('cv-footer')).not.toBeNull();
    expect(el.querySelector('p-toast')).not.toBeNull(); // the one toast host
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
  });

  it('leaves out the nav and footer on a chromeless route and brings them back elsewhere', async () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;

    await router.navigateByUrl('/auth');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).toBeNull();
    expect(el.querySelector('cv-footer')).toBeNull();
    expect(el.querySelector('main#main h1')).not.toBeNull();
    expect(el.querySelector('a.skip-link')).not.toBeNull();

    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).not.toBeNull();
    expect(el.querySelector('cv-footer')).not.toBeNull();
  });

  it('leaves out the nav and footer on the children of a chromeless parent route', async () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;

    await router.navigateByUrl('/area/inner');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).toBeNull();
    expect(el.querySelector('cv-footer')).toBeNull();
    expect(el.querySelector('main#main h1')).not.toBeNull();

    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).not.toBeNull();
  });

  it('marks exactly the six auth pages, the dashboard and the admin pages chromeless', () => {
    const chromeless = routes.filter((r) => r.data?.['chromeless']).map((r) => r.path);
    expect(chromeless.sort()).toEqual(
      [
        'admin',
        'check-email',
        'dashboard',
        'forgot-password',
        'login',
        'register',
        'reset-password',
        'verify-email',
      ].sort(),
    );
  });
});

describe('App with the real route table', () => {
  /** The address bar is already at `url` when the app boots, as on a hard reload; the router has not navigated yet. */
  async function boot(url: string, user?: UserDto) {
    TestBed.configureTestingModule({
      // The toast host is a deferred block (a dynamic import): nothing here needs it, and an import still
      // running when the spec ends fails the suite (EnvironmentTeardownError).
      deferBlockBehavior: DeferBlockBehavior.Manual,
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const restored = TestBed.inject(AuthStore).restoreSession();
    const refresh = http.expectOne('/api/v1/auth/refresh');
    if (user) refresh.flush({ accessToken: 't', user });
    else refresh.flush({}, { status: 401, statusText: 'Unauthorized' });
    await restored;
    TestBed.inject(Location).go(url);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chrome = () => [!!el.querySelector('cv-nav'), !!el.querySelector('cv-footer')];
    /** Navigates without waiting for the page's own requests (a logged in dashboard asks for its list). */
    const go = async (to: string) => {
      await TestBed.inject(Router).navigateByUrl(to);
      fixture.detectChanges();
    };
    const visit = async (to: string) => {
      await TestBed.inject(Router).navigateByUrl(to);
      await fixture.whenStable();
    };
    return { fixture, chrome, visit, go };
  }

  it('renders no nav or footer in the very first frame of every auth route, before any navigation ends', async () => {
    for (const url of [
      '/login',
      '/register',
      '/forgot-password',
      '/check-email?email=a@b.c',
      '/verify-email?token=t',
      '/reset-password?token=t',
    ]) {
      const { chrome, go } = await boot(url);
      expect(chrome(), url).toEqual([false, false]);
      await go(url); // let the lazy page finish loading: an import still running at teardown fails the suite
      TestBed.resetTestingModule();
    }
  });

  it('renders no nav or footer in the very first frame of the dashboard and its pages', async () => {
    for (const url of [
      '/dashboard',
      '/dashboard/favorites',
      '/dashboard/favorites?type=tv&page=2',
      '/dashboard/account',
    ]) {
      const { chrome, go } = await boot(url);
      expect(chrome(), url).toEqual([false, false]);
      await go(url); // let the lazy page finish loading: an import still running at teardown fails the suite
      TestBed.resetTestingModule();
    }
  });

  it('renders the nav and footer in the first frame of other routes', async () => {
    // '/dashboarding' shares a prefix with a chromeless route but is not below it.
    for (const url of ['/', '/movies', '/terms', '/dashboarding']) {
      const { chrome, go } = await boot(url);
      expect(chrome(), url).toEqual([true, true]);
      await go(url);
      TestBed.resetTestingModule();
    }
  });

  it('keeps the chrome off through a navigation into the dashboard and brings it back on leaving it', async () => {
    const member: UserDto = {
      id: 'u1',
      email: 'ada@example.com',
      name: 'Ada',
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { chrome, go } = await boot('/dashboard/favorites', member);
    await go('/dashboard/favorites');
    expect(chrome()).toEqual([false, false]);
    expect(TestBed.inject(Router).url).toBe('/dashboard/favorites');
    await go('/dashboard/account');
    expect(chrome()).toEqual([false, false]);
    await go('/movies');
    expect(chrome()).toEqual([true, true]);
    await go('/dashboard');
    expect(chrome()).toEqual([false, false]);
  });

  it('never draws the nav or footer while a logged out hard reload of a guarded area is redirected to /login', async () => {
    for (const url of ['/dashboard/favorites', '/admin/users']) {
      const { fixture, chrome } = await boot(url);
      const router = TestBed.inject(Router);
      const frames: boolean[][] = [];
      // After every router event (the app has already resynced on it) the page is drawn once.
      router.events.subscribe(() => {
        fixture.detectChanges();
        frames.push(chrome());
      });
      await router.navigateByUrl(url);
      await fixture.whenStable();

      expect(router.url, url).toMatch(/^\/login/);
      expect(frames.length, url).toBeGreaterThan(1);
      expect(
        frames.filter(([nav, footer]) => nav || footer),
        url,
      ).toEqual([]);
      TestBed.resetTestingModule();
    }
  });

  it('keeps the chrome off on /login, brings it back on /terms and hides it again on /login', async () => {
    const { chrome, visit } = await boot('/login');
    await visit('/login');
    expect(chrome()).toEqual([false, false]);
    await visit('/terms');
    expect(chrome()).toEqual([true, true]);
    await visit('/login');
    expect(chrome()).toEqual([false, false]);
  });
});
