import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../auth/auth.store';
import { UserDto } from '../models';
import { FavoritesStore } from './favorites.store';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.co',
  name: 'Ada',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('FavoritesStore', () => {
  let auth: InstanceType<typeof AuthStore>;
  let store: InstanceType<typeof FavoritesStore>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', children: [] },
          { path: 'title/:type/:id', children: [] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(AuthStore);
    store = TestBed.inject(FavoritesStore);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** Finishes the session restore as a visitor (the refresh is refused), like the app initializer does. */
  async function sessionReady() {
    void auth.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await auth.whenReady();
  }

  /** Logs in and answers the favorites load that the login triggers. */
  async function loginWith(ids: { mediaType: 'movie' | 'tv'; tmdbId: number }[]) {
    auth.setUser(user);
    TestBed.tick();
    http.expectOne('/api/v1/me/favorites/ids').flush(ids);
    await vi.waitFor(() => expect(store.keys().length).toBe(ids.length));
  }

  it('loads the keys on login and clears them on logout', async () => {
    await loginWith([{ mediaType: 'movie', tmdbId: 603 }]);
    expect(store.keys()).toEqual(['movie:603']);
    expect(store.isFavorite('movie', 603)).toBe(true);
    expect(store.isFavorite('tv', 603)).toBe(false);

    auth.clearSession();
    TestBed.tick();
    expect(store.keys()).toEqual([]);
  });

  it('toggle adds the key optimistically and removes it when the API fails', async () => {
    await sessionReady();
    await loginWith([{ mediaType: 'movie', tmdbId: 1 }]);

    const done = store.toggle('movie', 603);
    expect(store.isFavorite('movie', 603)).toBe(true);
    const req = http.expectOne('/api/v1/me/favorites/movie/603');
    expect(req.request.method).toBe('PUT');
    req.flush(null, { status: 500, statusText: 'Server Error' });

    await expect(done).rejects.toMatchObject({ status: 500 });
    expect(store.isFavorite('movie', 603)).toBe(false);
    expect(store.isFavorite('movie', 1)).toBe(true);
  });

  it('toggle removes an existing favorite and restores it when the API fails', async () => {
    await sessionReady();
    await loginWith([{ mediaType: 'tv', tmdbId: 1399 }]);

    const ok = store.toggle('tv', 1399);
    expect(store.isFavorite('tv', 1399)).toBe(false);
    const del = http.expectOne('/api/v1/me/favorites/tv/1399');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await ok;
    expect(store.isFavorite('tv', 1399)).toBe(false);

    const failed = store.toggle('tv', 1399);
    http.expectOne('/api/v1/me/favorites/tv/1399').flush(null, { status: 500, statusText: 'x' });
    await expect(failed).rejects.toBeTruthy();
    expect(store.isFavorite('tv', 1399)).toBe(false);
  });

  it('a toggle made while the load is in flight survives the load response', async () => {
    await sessionReady();
    auth.setUser(user);
    TestBed.tick();
    const load = http.expectOne('/api/v1/me/favorites/ids');

    const done = store.toggle('movie', 603);
    http.expectOne('/api/v1/me/favorites/movie/603').flush(null, { status: 204, statusText: 'x' });
    await done;

    load.flush([{ mediaType: 'tv', tmdbId: 1399 }]); // stale: computed before the toggle
    await vi.waitFor(() => expect(store.isFavorite('tv', 1399)).toBe(true));
    expect(store.isFavorite('movie', 603)).toBe(true);
  });

  it('an optimistic toggle still pending when the load arrives is kept, then rolled back on failure', async () => {
    await sessionReady();
    auth.setUser(user);
    TestBed.tick();
    const load = http.expectOne('/api/v1/me/favorites/ids');

    const done = store.toggle('movie', 603);
    const put = http.expectOne('/api/v1/me/favorites/movie/603');
    load.flush([]);
    await vi.waitFor(() => expect(store.keys()).toEqual(['movie:603']));

    put.flush(null, { status: 500, statusText: 'x' });
    await expect(done).rejects.toBeTruthy();
    expect(store.isFavorite('movie', 603)).toBe(false);
  });

  it('toggle waits for the session restore before deciding the user is a visitor', async () => {
    void auth.restoreSession();
    const refresh = http.expectOne('/api/v1/auth/refresh');

    const done = store.toggle('movie', 603);
    await Promise.resolve();
    expect(router.url).toBe('/'); // not redirected while the restore is still running

    refresh.flush({ accessToken: 't', user });
    await vi.waitFor(() => expect(auth.isLoggedIn()).toBe(true));
    const put = await vi.waitFor(() => http.expectOne('/api/v1/me/favorites/movie/603'));
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });
    await done;
    TestBed.tick();
    http.expectOne('/api/v1/me/favorites/ids').flush([{ mediaType: 'movie', tmdbId: 603 }]);
    await vi.waitFor(() => expect(store.keys()).toEqual(['movie:603']));
  });

  it('toggle as a visitor navigates to /login and makes no API call', async () => {
    await sessionReady();
    await router.navigateByUrl('/title/movie/603');
    await store.toggle('movie', 603);
    http.expectNone('/api/v1/me/favorites/movie/603');
    expect(router.url).toBe('/login?next=%2Ftitle%2Fmovie%2F603');
    expect(store.isFavorite('movie', 603)).toBe(false);
  });
});
