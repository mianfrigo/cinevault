import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthStore } from '@core/auth/auth.store';

/**
 * Spec helper: the real route table (guards and input binding included) with a finished session
 * restore as a visitor, so guest pages render. Typing goes through real `input` events.
 */
export async function setup(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const restored = TestBed.inject(AuthStore).restoreSession();
  http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
  await restored;

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  harness.detectChanges();
  const el = harness.routeNativeElement as HTMLElement;

  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    harness.detectChanges();
  };
  /** The request an action starts: it appears after effects run, so poll for it. */
  const request = (path: string) =>
    vi.waitFor(() => {
      harness.detectChanges();
      return http.expectOne(`/api/v1/auth/${path}`);
    });
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  /** Waits until the page shows this text (async actions settle after the request is flushed). */
  const seeText = (expected: string) =>
    vi.waitFor(() => {
      harness.detectChanges();
      expect(el.textContent).toContain(expected);
    });
  const url$ = () => TestBed.inject(Router).url;
  const text = () => el.textContent ?? '';
  return { http, el, type, submit, request, settle, seeText, url: url$, text, harness };
}

export const error = (statusCode: number, code: string) => ({
  body: { statusCode, code, message: 'raw server text' },
  init: { status: statusCode, statusText: code },
});
