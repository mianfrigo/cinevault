import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthStore } from '@core/auth/auth.store';
import { FavoriteItem, Paged, UserDto } from '@core/models';

export const member: UserDto = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const fav = (tmdbId: number, extra: Partial<FavoriteItem> = {}): FavoriteItem => ({
  tmdbId,
  mediaType: 'movie',
  title: `Title ${tmdbId}`,
  year: 2024,
  rating: 7,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  addedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

export const paged = (items: FavoriteItem[], page = 1, totalPages = 1): Paged<FavoriteItem> => ({
  items,
  page,
  totalPages,
  totalItems: items.length,
});

/**
 * Spec helper: the real route table (authGuard and input binding included) with a finished
 * session restore as `user` (a visitor when null). The hearts store's ids request is answered
 * with an empty list wherever it appears.
 */
export async function setup(url: string, user: UserDto | null = member) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const restored = TestBed.inject(AuthStore).restoreSession();
  const refresh = http.expectOne('/api/v1/auth/refresh');
  if (user) refresh.flush({ accessToken: 't', user });
  else refresh.flush({}, { status: 401, statusText: 'Unauthorized' });
  await restored;

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;

  /** Answers the hearts store's load, which any logged-in page triggers. */
  const answerHearts = () => http.match('/api/v1/me/favorites/ids').forEach((r) => r.flush([]));
  const settle = async () => {
    answerHearts();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  /** The one favorites list request with these query params. Polls: effects start it after the first render. */
  const list = (params: Record<string, string | null>) =>
    vi.waitFor(() => {
      harness.detectChanges();
      return http.expectOne(
        (r) =>
          r.url === '/api/v1/me/favorites' &&
          Object.entries(params).every(([k, v]) => r.params.get(k) === v),
      );
    });
  /** The request an action starts: it appears after effects run, so poll for it. */
  const request = (method: string, path: string) =>
    vi.waitFor(() => {
      harness.detectChanges();
      return http.expectOne((r) => r.method === method && r.url === `/api/v1${path}`);
    });
  /** Waits until the page shows this text (async actions settle after the request is flushed). */
  const seeText = (expected: string) =>
    vi.waitFor(() => {
      harness.detectChanges();
      expect(el.textContent).toContain(expected);
    });
  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const submit = (formSelector: string) => {
    el.querySelector(formSelector)!.dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  };
  return {
    http,
    el,
    harness,
    settle,
    list,
    request,
    seeText,
    type,
    submit,
    url: () => TestBed.inject(Router).url,
    text: () => el.textContent ?? '',
  };
}

export const error = (statusCode: number, code: string) => ({
  body: { statusCode, code, message: 'raw server text' },
  init: { status: statusCode, statusText: code },
});
