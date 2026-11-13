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

/** Build output names carry a content hash ("main-4NQ7JXKO.js", "chunk-B5lawOtB.js"); anything else (robots.txt, favicon) is not immutable. */
export function staticCacheControl(filePath: string): string {
  return /-[\w-]{8}\.[a-z0-9]+$/.test(filePath)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600';
}

/**
 * Sent on every response. Referrer-Policy keeps the one-time tokens in the reset-password and
 * verify-email URLs out of Referer headers. No Content-Security-Policy yet (launch checklist).
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};
