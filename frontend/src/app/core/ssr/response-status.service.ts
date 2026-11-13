import { Injectable, RESPONSE_INIT, inject } from '@angular/core';

/** Seconds a client is told to wait before asking again after a 503. */
const RETRY_AFTER = '30';

/**
 * The HTTP status and caching of the page being rendered on the server. The response init only exists
 * during a server render: in the browser (and in tests) every call does nothing.
 *
 * - `set(404)`: the page shown is "not found".
 * - `set(503)`: the primary content of the page failed to load (`Retry-After` is sent too).
 * - `noStore()`: a secondary part failed; the page keeps its 200 (it still has content worth indexing)
 *   but must not sit in a CDN.
 * All of them also send `Cache-Control: no-store`.
 */
@Injectable({ providedIn: 'root' })
export class ResponseStatus {
  private readonly init = inject(RESPONSE_INIT, { optional: true });

  set(status: 404 | 503): void {
    this.apply(status === 503 ? { 'Retry-After': RETRY_AFTER } : {}, status);
  }

  noStore(): void {
    this.apply({});
  }

  private apply(extra: Record<string, string>, status?: number): void {
    if (!this.init) return;
    const headers = new Headers(this.init.headers);
    headers.set('Cache-Control', 'no-store');
    for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    if (status !== undefined) this.init.status = status;
    this.init.headers = headers;
  }
}
