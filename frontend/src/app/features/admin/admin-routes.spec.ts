import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { AuthStore } from '@core/auth/auth.store';
import { UserDto } from '@core/models';
import { member } from '../dashboard/dashboard.testing';
import { me, openAdmin, person, usersOf } from './admin.testing';

describe('/admin routes', () => {
  describe('guards', () => {
    it('send a visitor to the login with the admin page as next', async () => {
      const { url, http } = await openAdmin('/admin/users', null as unknown as UserDto);
      expect(url()).toBe('/login?next=%2Fadmin%2Fusers');
      http.match(() => true);
    });

    it('send a member to their favorites', async () => {
      const { url, http } = await openAdmin('/admin/users', member);
      expect(url()).toBe('/dashboard/favorites');
      http.match(() => true);
    });

    it('send a member away from the overview too', async () => {
      const { url, http } = await openAdmin('/admin/overview', member);
      expect(url()).toBe('/dashboard/favorites');
      http.match(() => true);
    });

    it('let an administrator in, and /admin goes to the overview', async () => {
      const { url, http, harness } = await openAdmin('/admin');
      expect(url()).toBe('/admin/overview');
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Overview');
      http.match(() => true);
    });
  });

  describe('the sidebar', () => {
    const items = (shell: HTMLElement, selector: string) =>
      Array.from(shell.querySelectorAll(`${selector} a`)).map((a) => [
        a.textContent?.trim(),
        a.getAttribute('href'),
      ]);

    it('gives an administrator an Admin group with Users and Overview, and keeps Favorites and Account', async () => {
      const { shell, http, usersList } = await openAdmin('/admin/users');
      (await usersList()).flush(usersOf([me, person(2)]));

      const sidebar = shell.querySelector('aside')!;
      const group = sidebar.querySelector('[role=group]')!;
      expect(group.textContent).toContain('Admin');
      expect(group.getAttribute('aria-labelledby')).toBe(group.querySelector('p')?.id);
      expect(items(shell, 'aside [role=group]')).toEqual([
        ['Users', '/admin/users'],
        ['Overview', '/admin/overview'],
      ]);
      expect(items(shell, 'aside nav').map((i) => i[1])).toEqual([
        '/dashboard/favorites',
        '/dashboard/account',
        '/admin/users',
        '/admin/overview',
      ]);
      expect(sidebar.querySelector('a[href="/admin/users"]')?.getAttribute('aria-current')).toBe(
        'page',
      );
      expect(sidebar.textContent).toContain('Administrator');
      http.match(() => true);
    });

    it('puts the admin items in the phone tab bar too', async () => {
      const { shell, http, usersList } = await openAdmin('/admin/users');
      (await usersList()).flush(usersOf([me]));
      const tabs = shell.querySelector('nav[aria-label="Dashboard (small screens)"]')!;
      expect(Array.from(tabs.querySelectorAll('a')).map((a) => a.textContent?.trim())).toEqual([
        'Favorites',
        'Account',
        'Users',
        'Overview',
        'Site',
      ]);
      http.match(() => true);
    });

    it('does not show a member the Admin group', async () => {
      const { shell, http, settle } = await openAdmin('/dashboard/favorites', member);
      await settle();
      http.match(() => true);
      expect(shell.querySelector('aside [role=group]')).toBeNull();
      expect(shell.textContent).not.toContain('Admin');
      expect(shell.querySelector('a[href^="/admin"]')).toBeNull();
    });

    it('keeps the TMDB credit on the admin pages', async () => {
      const { shell, http, usersList } = await openAdmin('/admin/users');
      (await usersList()).flush(usersOf([me]));
      expect(shell.textContent).toContain(
        'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      );
      http.match(() => true);
    });
  });

  describe('chromeless', () => {
    function render(path: string) {
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
      // The address bar names the page before the router has navigated (the lazy page is still loading).
      TestBed.inject(Location).go(path);
      return TestBed.createComponent(App);
    }
    const login = async (user: UserDto) => {
      const http = TestBed.inject(HttpTestingController);
      const restored = TestBed.inject(AuthStore).restoreSession();
      http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't', user });
      await restored;
      return http;
    };

    it('has no app nav or footer on the first frame of an admin page', async () => {
      const fixture = render('/admin/users');
      expect((fixture.nativeElement as HTMLElement).querySelector('cv-nav')).toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('cv-footer')).toBeNull();
      await fixture.whenStable(); // nothing may still be loading when the test ends
      TestBed.inject(HttpTestingController).match(() => true);
    });

    it('has none after navigating there, and shows the nav again elsewhere', async () => {
      const fixture = render('/');
      const el = fixture.nativeElement as HTMLElement;
      const http = await login(me);
      const router = TestBed.inject(Router);

      await router.navigateByUrl('/admin/overview');
      fixture.detectChanges();
      http.match(() => true);
      expect(router.url).toBe('/admin/overview');
      expect(el.querySelector('cv-nav')).toBeNull();
      expect(el.querySelector('cv-footer')).toBeNull();
      expect(el.querySelector('cv-dashboard-shell')).not.toBeNull();

      await router.navigateByUrl('/admin/users');
      fixture.detectChanges();
      http.match(() => true);
      expect(el.querySelector('cv-nav')).toBeNull();

      await router.navigateByUrl('/movies');
      fixture.detectChanges();
      http.match(() => true);
      expect(el.querySelector('cv-nav')).not.toBeNull();
      expect(el.querySelector('cv-footer')).not.toBeNull();
    });
  });
});
