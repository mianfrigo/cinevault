import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE } from '../api/api-client';
import { AuthStore } from './auth.store';

/**
 * Adds the bearer token to API requests and the cookie to /auth/* requests. A 401 from any other
 * API route triggers one (shared) refresh and one retry; if the refresh fails the session is
 * cleared and the user goes to /login?next=<current url>.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_BASE);
  if (!req.url.startsWith(base)) return next(req);

  const auth = inject(AuthStore);
  const router = inject(Router);
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const isAuthRoute = req.url.startsWith(`${base}/auth/`);

  const send = () => {
    const token = auth.accessToken();
    let out: HttpRequest<unknown> = req;
    if (isAuthRoute) out = out.clone({ withCredentials: true });
    if (token) out = out.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    return next(out);
  };

  return send().pipe(
    catchError((error: unknown) => {
      // The server has no session to refresh; the browser decides after its own restore.
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        isAuthRoute ||
        !browser
      ) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((refreshed) => {
          if (refreshed) return send(); // retried once; a second 401 goes to the caller
          auth.clearSession();
          void router.navigate(['/login'], { queryParams: { next: router.url } });
          return throwError(() => error);
        }),
      );
    }),
  );
};
