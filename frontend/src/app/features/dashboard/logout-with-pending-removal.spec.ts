import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from '../../app';
import { routes } from '../../app.routes';
import { authInterceptor } from '../../core/auth/auth.interceptor';
import { AuthStore } from '../../core/auth/auth.store';
import { fav, member, paged } from './dashboard.testing';

const noContent = { status: 204, statusText: 'No Content' };

describe('Logging out with a removal pending', () => {
  it('sends the pending DELETE with the session token and ends on /, not /login', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        MessageService,
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    const restored = TestBed.inject(AuthStore).restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'tok', user: member });
    await restored;

    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    await router.navigateByUrl('/dashboard/favorites');
    const answerHearts = () => http.match('/api/v1/me/favorites/ids').forEach((r) => r.flush([]));
    const list = await vi.waitFor(() => {
      fixture.detectChanges();
      return http.expectOne((r) => r.url === '/api/v1/me/favorites');
    });
    list.flush(paged([fav(1)]));
    answerHearts();
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Title 1 from favorites"]',
    )!.click();
    await fixture.whenStable();

    // Log out through the account menu in the nav (the only log out on a phone).
    const menu = await vi.waitFor(() => {
      fixture.detectChanges();
      const b = el.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]');
      expect(b).not.toBeNull();
      return b!;
    });
    menu.click();
    const logout = await vi.waitFor(() => {
      const item = Array.from(document.querySelectorAll<HTMLElement>('.p-menu-item-link')).find(
        (a) => a.textContent?.includes('Log out'),
      );
      expect(item).toBeDefined();
      return item!;
    });
    logout.click();

    const del = await vi.waitFor(() => {
      fixture.detectChanges();
      return http.expectOne({ method: 'DELETE', url: '/api/v1/me/favorites/movie/1' });
    });
    expect(del.request.headers.get('Authorization')).toBe('Bearer tok');
    del.flush(null, noContent);
    const out = await vi.waitFor(() => http.expectOne('/api/v1/auth/logout'));
    out.flush(null, noContent);
    await vi.waitFor(() => expect(TestBed.inject(AuthStore).isLoggedIn()).toBe(false));
    expect(router.url).toBe('/');
    // The home page asked for its catalog meanwhile; nothing answers it here.
    http.match((r) => r.url.startsWith('/api/v1/catalog/'));
    http.verify();
  });
});
