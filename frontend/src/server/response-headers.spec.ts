import { SECURITY_HEADERS, cacheControlFor, staticCacheControl } from './response-headers';

describe('cacheControlFor', () => {
  it.each([
    '/',
    '/movies',
    '/tv',
    '/new',
    '/search',
    '/terms',
    '/privacy',
    '/genre/movie/28',
    '/genre/tv/18',
    '/title/movie/603',
    '/title/tv/1399/',
  ])('lets a CDN cache the catalog page %s', (path) => {
    expect(cacheControlFor(path)).toBe('public, s-maxage=300, stale-while-revalidate=600');
  });

  it.each([
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/check-email',
    '/dashboard',
    '/dashboard/favorites',
    '/admin/users',
    '/api/v1/auth/refresh',
    '/title/movie/abc',
    '/title/book/1',
    '/genre/movie/x',
    '/movies/extra',
    '/no-such-page',
  ])('never stores %s', (path) => {
    expect(cacheControlFor(path)).toBe('no-store');
  });
});

describe('cacheControlFor with a status', () => {
  it.each([400, 404, 503, 302])('never stores a catalog path answered with %s', (status) => {
    expect(cacheControlFor('/title/movie/603', status)).toBe('no-store');
  });
});

describe('staticCacheControl', () => {
  it('caches content-hashed build files for a year', () => {
    for (const file of [
      'main-VQV576NW.js',
      'styles-2W7SC7JB.css',
      'chunk-B5lawOtB.js',
      'chunk-BKaDEST-.js',
    ]) {
      expect(staticCacheControl(`/browser/${file}`)).toBe('public, max-age=31536000, immutable');
    }
    expect(staticCacheControl('C:\\app\\browser\\styles-W2V3LZ5B.css')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('does not make unhashed files immutable', () => {
    expect(staticCacheControl('/browser/robots.txt')).toBe('public, max-age=3600');
    expect(staticCacheControl('/browser/favicon.ico')).toBe('public, max-age=3600');
  });
});

describe('SECURITY_HEADERS', () => {
  it('keeps referrers, sniffing and framing off', () => {
    expect(SECURITY_HEADERS).toMatchObject({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
  });
});
