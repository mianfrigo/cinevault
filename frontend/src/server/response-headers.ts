/** Catalog pages: public, identical for every visitor, safe for a CDN or reverse proxy to cache. */
const CATALOG_PATHS = [
  /^\/$/,
  /^\/(movies|tv|new|search|terms|privacy)\/?$/,
  /^\/genre\/(movie|tv)\/\d+\/?$/,
  /^\/title\/(movie|tv)\/\d+\/?$/,
];

const CATALOG_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

/**
 * Cache-Control of a rendered page by URL path and status: a successful catalog page is cacheable for a
 * few minutes, everything else (auth pages, dashboard, admin, unknown paths, redirects, rejected hosts)
 * is never stored. A page that turns out to be an error or "not found" sets `no-store` itself
 * (core/ssr/response-status.service.ts).
 */
export function cacheControlFor(pathname: string, status = 200): string {
  return status === 200 && CATALOG_PATHS.some((re) => re.test(pathname))
    ? CATALOG_CACHE
    : 'no-store';
}

/**
 * What to set on a rendered page once the engine has answered, or undefined to leave the headers alone:
 * the page chose its own Cache-Control (not found / error pages), or nothing was rendered. The caller
 * starts every response at `no-store`, so only a 200 catalog page is ever upgraded.
 */
export function pageCacheControl(pathname: string, response: Response | null): string | undefined {
  if (!response || response.headers.has('Cache-Control')) return undefined;
  return cacheControlFor(pathname, response.status);
}

/**
 * The Angular build names its scripts, styles and fonts with an 8 character content hash
 * ("main-VQV576NW.js", "chunk-B5lawOtB.js", "primeicons-S6ICFECY.eot"): those never change under the same
 * name. Anything else in the build folder (robots.txt, the favicon, other public files, source maps) can
 * change and gets an hour. `path` is relative to the build output folder.
 */
export function staticCacheControl(path: string): string {
  return /-[A-Za-z0-9_-]{8}\.(js|css|woff2?|eot|ttf)$/.test(path)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';
}

/**
 * Sent on every response. Referrer-Policy keeps the one-time tokens in the reset-password and
 * verify-email URLs out of Referer headers. No full Content-Security-Policy yet (launch checklist).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};
