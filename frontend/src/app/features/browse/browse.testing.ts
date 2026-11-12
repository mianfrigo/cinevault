import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { Paged, TitleSummary } from '@core/models';

export const title = (tmdbId: number, name = `Title ${tmdbId}`): TitleSummary => ({
  tmdbId,
  mediaType: 'movie',
  title: name,
  year: 2024,
  rating: 7.4,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
});

export const paged = (items: TitleSummary[], page = 1, totalPages = 1): Paged<TitleSummary> => ({
  items,
  page,
  totalPages,
  totalItems: items.length,
});

/** Spec helper: the real route table with the app's input binding, so specs cover the route wiring too. */
export async function setup(url: string, extraProviders: Provider[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
      ...extraProviders,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges(); // starts the requests; stability waits for them, so do not await it yet
  const el = harness.routeNativeElement as HTMLElement;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  /** Takes the one catalog request with this path and these query params. */
  const request = (path: string, params: Record<string, string>) =>
    http.expectOne(
      (r) =>
        r.url === `/api/v1/catalog/${path}` &&
        Object.entries(params).every(([k, v]) => r.params.get(k) === v),
    );
  /** The request a click or retry starts: it appears after navigation and effects, so poll for it (settling would wait on it forever). */
  const next = (path: string, params: Record<string, string>) =>
    vi.waitFor(() => {
      harness.detectChanges();
      return request(path, params);
    });
  const none = (path: string) => http.expectNone((r) => r.url === `/api/v1/catalog/${path}`);
  const url$ = () => TestBed.inject(Router).url;
  return { http, el, settle, request, next, none, url: url$ };
}
