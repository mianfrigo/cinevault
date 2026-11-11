import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiError } from '../models';

/** Base URL of the API. The browser uses the same-origin path; the server config overrides it with API_INTERNAL_URL. */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

type Params = Record<string, string | number | undefined>;

/** Thin wrapper over HttpClient that prefixes the API base. Bodies default to `{}` so the backend never answers 415. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE);

  get<T>(path: string, params?: Params): Observable<T> {
    const defined = Object.entries(params ?? {}).filter(([, v]) => v !== undefined);
    return this.http.get<T>(this.base + path, {
      params: Object.fromEntries(defined) as Record<string, string | number>,
    });
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.post<T>(this.base + path, body);
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.put<T>(this.base + path, body);
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.http.patch<T>(this.base + path, body);
  }

  delete<T>(path: string, body?: unknown): Observable<T> {
    return this.http.delete<T>(this.base + path, { body });
  }
}

/** The API error body of a failed request, or a synthetic one when the server could not be reached. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse && typeof error.error?.code === 'string') {
    return error.error as ApiError;
  }
  const statusCode = error instanceof HttpErrorResponse ? error.status : 0;
  return {
    statusCode,
    code: statusCode === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
    message: 'Something went wrong. Please try again.',
  };
}
