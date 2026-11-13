import { Injectable, RESPONSE_INIT, inject } from '@angular/core';

/**
 * The HTTP status of the page being rendered on the server. A page that shows "not found" or an error
 * still has to answer 404 / 503, and the response must not be cached. The response init only exists
 * during a server render: in the browser (and in tests) every call does nothing.
 */
@Injectable({ providedIn: 'root' })
export class ResponseStatus {
  private readonly init = inject(RESPONSE_INIT, { optional: true });

  set(status: 404 | 503): void {
    if (!this.init) return;
    const headers = new Headers(this.init.headers);
    headers.set('Cache-Control', 'no-store');
    this.init.status = status;
    this.init.headers = headers;
  }
}
