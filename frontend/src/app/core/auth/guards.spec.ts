import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { UserDto } from '../models';
import { AuthStore } from './auth.store';
import { adminGuard, authGuard, guestGuard, safeNext } from './guards';

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  email: 'a@b.co',
  name: 'Ada',
  role,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('route guards', () => {
  let auth: InstanceType<typeof AuthStore>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** Runs the session restore: with a user (cookie accepted) or as a visitor (cookie rejected). */
  async function restore(as: UserDto | null) {
    const done = auth.restoreSession();
    const req = http.expectOne('/api/v1/auth/refresh');
    if (as) req.flush({ accessToken: 't', user: as });
    else req.flush({}, { status: 401, statusText: 'Unauthorized' });
    await done;
  }

  const run = async (guard: CanActivateFn, url: string) => {
    const result = await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );
    return result instanceof UrlTree ? router.serializeUrl(result) : result;
  };

  it('authGuard redirects a visitor to /login?next=/dashboard/favorites', async () => {
    const pending = run(authGuard, '/dashboard/favorites');
    await restore(null);
    expect(await pending).toBe('/login?next=%2Fdashboard%2Ffavorites');
  });

  it('authGuard lets a logged-in user through', async () => {
    await restore(user('USER'));
    expect(await run(authGuard, '/dashboard/favorites')).toBe(true);
  });

  it('authGuard waits for the session restore before deciding', async () => {
    let settled = false;
    const pending = run(authGuard, '/dashboard/account').then((r) => {
      settled = true;
      return r;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await restore(user('USER'));
    expect(await pending).toBe(true);
  });

  it('adminGuard redirects a USER to /dashboard/favorites', async () => {
    await restore(user('USER'));
    expect(await run(adminGuard, '/admin/users')).toBe('/dashboard/favorites');
  });

  it('adminGuard lets an ADMIN through and sends a visitor to /login', async () => {
    await restore(user('ADMIN'));
    expect(await run(adminGuard, '/admin/users')).toBe(true);
    auth.clearSession();
    expect(await run(adminGuard, '/admin/users')).toBe('/login?next=%2Fadmin%2Fusers');
  });

  it('guestGuard redirects a logged-in user', async () => {
    await restore(user('USER'));
    expect(await run(guestGuard, '/login')).toBe('/dashboard/favorites');
  });

  it('guestGuard returns a logged-in user to a same-origin next, and lets visitors in', async () => {
    await restore(user('USER'));
    expect(await run(guestGuard, '/login?next=%2Ftitle%2Fmovie%2F603')).toBe('/title/movie/603');
    expect(await run(guestGuard, '/login?next=%2F%2Fevil.com')).toBe('/dashboard/favorites');
    auth.clearSession();
    expect(await run(guestGuard, '/login')).toBe(true);
  });

  it('safeNext accepts only same-origin paths', () => {
    expect(safeNext('/title/movie/603')).toBe('/title/movie/603');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'javascript:1', '']) {
      expect(safeNext(bad)).toBeNull();
    }
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
  });
});
