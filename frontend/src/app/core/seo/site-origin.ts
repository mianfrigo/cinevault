import { DOCUMENT, InjectionToken, TransferState, inject, makeStateKey } from '@angular/core';

export const SITE_ORIGIN_KEY = makeStateKey<string>('siteOrigin');

/**
 * The public origin canonical links and og tags are built on. The browser reads the origin the server
 * chose (transfer state), so hydration never rewrites a canonical link; without it, its own origin.
 * The server config overrides this with `siteOriginFrom`.
 */
export const SITE_ORIGIN = new InjectionToken<string>('SITE_ORIGIN', {
  providedIn: 'root',
  factory: () => inject(TransferState).get(SITE_ORIGIN_KEY, inject(DOCUMENT).location.origin),
});

const FALLBACK_ORIGIN = 'http://localhost:4200';

/**
 * Server side: `SITE_URL` (the canonical public URL, set it in production) wins; else the origin of
 * the request, whose Host header Angular SSR already checked against NG_ALLOWED_HOSTS; else localhost.
 * Behind a TLS-terminating proxy the request origin can read `http:`, which is why production sets SITE_URL.
 */
export function siteOriginFrom(siteUrl: string | undefined, request: Request | null): string {
  for (const candidate of [siteUrl, request?.url]) {
    try {
      const url = new URL(candidate ?? '');
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      // not a URL: try the next source
    }
  }
  return FALLBACK_ORIGIN;
}
