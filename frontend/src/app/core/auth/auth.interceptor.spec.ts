import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiClient } from '../api/api-client';
import { UserDto } from '../models';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from './auth.store';

const user: UserDto = {
  id: 'u1',
  email: 'a@b.co',
  name: 'Ada',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('authInterceptor', () => {
  let api: ApiClient;
  let auth: InstanceType<typeof AuthStore>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', children: [] },
          { path: 'dash', children: [] },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(ApiClient);
    auth = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);

    const login = auth.login('a@b.co', 'pw');
    http.expectOne('/api/v1/auth/login').flush({ accessToken: 't1', user });
    await login;
  });

  afterEach(() => http.verify());

  // The retry is issued after the refresh promise settles, so wait for it to appear.
  const nextRequest = (url: string) => vi.waitFor(() => http.expectOne(url));

  it('attaches the bearer token to API requests', () => {
    api.get('/me').subscribe();
    const req = http.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t1');
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });

  it('sends credentials on /auth requests', () => {
    void auth.logout();
    const req = http.expectOne('/api/v1/auth/logout');
    expect(req.request.withCredentials).toBe(true);
    req.flush(null);
  });

  it('a 401 triggers one refresh then retries the original request once', async () => {
    let result: unknown;
    api.get('/me').subscribe((r) => (result = r));
    http.expectOne('/api/v1/me').flush({}, unauthorized);

    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't2', user });
    const retry = await nextRequest('/api/v1/me');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer t2');
    retry.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('a second 401 on the retry reaches the caller without another refresh', async () => {
    let status = 0;
    api.get('/me').subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/api/v1/me').flush({}, unauthorized);
    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 't2', user });
    (await nextRequest('/api/v1/me')).flush({}, unauthorized);
    expect(status).toBe(401);
  });

  it('a 401 from an /auth route is not refreshed', async () => {
    const failed = auth.login('a@b.co', 'bad');
    const body = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'x' };
    http.expectOne('/api/v1/auth/login').flush(body, unauthorized);
    await expect(failed).rejects.toEqual(body);
    http.expectNone('/api/v1/auth/refresh');
  });

  it('failed refresh clears the user and navigates to /login with next', async () => {
    await router.navigateByUrl('/dash');
    let status = 0;
    api.get('/me').subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/api/v1/me').flush({}, unauthorized);
    http.expectOne('/api/v1/auth/refresh').flush({}, unauthorized);

    await vi.waitFor(() => expect(router.url).toBe('/login?next=%2Fdash'));
    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
    expect(status).toBe(401);
  });
});

describe('authInterceptor on the server', () => {
  it('lets a 401 reach the caller without clearing the session or navigating', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        provideRouter([
          { path: 'login', children: [] },
          { path: 'dash', children: [] },
        ]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthStore);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/dash');
    auth.setUser(user);

    let status = 0;
    TestBed.inject(ApiClient)
      .get('/me')
      .subscribe({ error: (e) => (status = e.status) });
    http.expectOne('/api/v1/me').flush({}, unauthorized);

    expect(status).toBe(401);
    http.expectNone('/api/v1/auth/refresh');
    expect(auth.user()).not.toBeNull();
    expect(router.url).toBe('/dash');
    http.verify();
  });
});
