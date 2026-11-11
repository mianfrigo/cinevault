import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserDto } from '../models';
import { AuthStore } from './auth.store';

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  email: 'a@b.co',
  name: 'Ada',
  role,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
});
const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('AuthStore', () => {
  let store: InstanceType<typeof AuthStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    http.verify();
  });

  it('refresh called twice at once makes one HTTP request', async () => {
    const a = store.refresh();
    const b = store.refresh();
    const req = http.expectOne('/api/v1/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ accessToken: 't1', user: user('USER') });
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(store.accessToken()).toBe('t1');
    expect(store.isLoggedIn()).toBe(true);
  });

  it('refresh waits for the cross-tab lock "cv-refresh" before it calls the API', async () => {
    let release!: () => void;
    const request = vi.fn(
      (_name: string, cb: () => Promise<boolean>) =>
        new Promise<boolean>((resolve) => (release = () => resolve(cb()))),
    );
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });

    const done = store.refresh();
    expect(request).toHaveBeenCalledWith('cv-refresh', expect.any(Function));
    http.expectNone('/api/v1/auth/refresh');

    release();
    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't2', user: user('USER') });
    expect(await done).toBe(true);
  });

  it('refresh resolves false and clears the session when the cookie is rejected', async () => {
    store.setUser(user('USER'));
    const done = store.refresh();
    http.expectOne('/api/v1/auth/refresh').flush({}, unauthorized);
    expect(await done).toBe(false);
    expect(store.user()).toBeNull();
  });

  it('isAdmin is true only for role ADMIN', () => {
    expect(store.isAdmin()).toBe(false);
    store.setUser(user('USER'));
    expect(store.isAdmin()).toBe(false);
    expect(store.isLoggedIn()).toBe(true);
    store.setUser(user('ADMIN'));
    expect(store.isAdmin()).toBe(true);
  });

  it('login stores the session and rejects with the API error body on failure', async () => {
    const ok = store.login('a@b.co', 'pw');
    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ email: 'a@b.co', password: 'pw' });
    req.flush({ accessToken: 't3', user: user('USER') });
    await ok;
    expect(store.accessToken()).toBe('t3');

    const bad = store.login('a@b.co', 'nope');
    const body = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' };
    http.expectOne('/api/v1/auth/login').flush(body, unauthorized);
    await expect(bad).rejects.toEqual(body);
  });

  it('logout clears the session even when the API call fails', async () => {
    store.setUser(user('USER'));
    const done = store.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await done;
    expect(store.user()).toBeNull();
    expect(store.accessToken()).toBeNull();
  });

  it('restoreSession restores a user from the cookie and then sets ready', async () => {
    expect(store.ready()).toBe(false);
    const done = store.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't4', user: user('ADMIN') });
    await done;
    expect(store.ready()).toBe(true);
    expect(store.isAdmin()).toBe(true);
  });
});
