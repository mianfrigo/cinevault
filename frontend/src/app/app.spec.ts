import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from './app';
import { routes } from './app.routes';
import { AuthStore } from './core/auth/auth.store';

@Component({ selector: 'cv-test-page', template: '<h1>Page</h1>' })
class TestPage {}

function render() {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: '', component: TestPage },
        { path: 'auth', component: TestPage, data: { chromeless: true } },
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

  it('marks exactly the six auth pages chromeless', () => {
    const chromeless = routes.filter((r) => r.data?.['chromeless']).map((r) => r.path);
    expect(chromeless.sort()).toEqual(
      [
        'check-email',
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
  async function boot(url: string) {
    TestBed.configureTestingModule({
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
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    await restored;
    TestBed.inject(Location).go(url);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chrome = () => [!!el.querySelector('cv-nav'), !!el.querySelector('cv-footer')];
    const visit = async (to: string) => {
      await TestBed.inject(Router).navigateByUrl(to);
      await fixture.whenStable();
    };
    return { fixture, chrome, visit };
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
      const { chrome } = await boot(url);
      expect(chrome(), url).toEqual([false, false]);
      TestBed.resetTestingModule();
    }
  });

  it('renders the nav and footer in the first frame of other routes', async () => {
    for (const url of ['/', '/movies', '/terms']) {
      const { chrome } = await boot(url);
      expect(chrome(), url).toEqual([true, true]);
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
