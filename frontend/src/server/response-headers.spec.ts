import {
  SECURITY_HEADERS,
  cacheControlFor,
  pageCacheControl,
  staticCacheControl,
} from './response-headers';

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

describe('pageCacheControl', () => {
  const page = (status: number, headers?: HeadersInit) =>
    new Response('<html></html>', { status, headers });

  it('upgrades a 200 catalog page', () => {
    expect(pageCacheControl('/title/movie/603', page(200))).toBe(
      'public, s-maxage=300, stale-while-revalidate=600',
    );
  });

  it('leaves a 200 private page at no-store', () => {
    expect(pageCacheControl('/dashboard/favorites', page(200))).toBe('no-store');
  });

  it('leaves the headers alone when the page chose its own Cache-Control', () => {
    // A 200 that asked for no-store (a degraded page) must not be upgraded.
    const degraded = page(200, { 'Cache-Control': 'no-store' });
    expect(pageCacheControl('/', degraded)).toBeUndefined();
  });

  it('never upgrades an error or a redirect', () => {
    expect(pageCacheControl('/movies', page(404))).toBe('no-store');
    expect(pageCacheControl('/movies', page(503))).toBe('no-store');
    expect(pageCacheControl('/movies', page(302))).toBe('no-store');
  });

  it('has nothing to say when the engine rendered nothing', () => {
    expect(pageCacheControl('/movies', null)).toBeUndefined();
  });
});

describe('staticCacheControl', () => {
  it.each([
    'main-VQV576NW.js',
    'styles-2W7SC7JB.css',
    'chunk-B5lawOtB.js',
    'chunk-BKaDEST-.js',
    'media/primeicons-S6ICFECY.eot',
    'media/inter-A1B2C3D4.woff2',
  ])('caches the content-hashed build file %s for a year', (path) => {
    expect(staticCacheControl(path)).toBe('public, max-age=31536000, immutable');
  });

  it.each([
    'robots.txt',
    'favicon.ico',
    'foo-barbazqx.png',
    'foo-barbazqx.jpg',
    'main-VQV576NW.js.map',
    'main.js',
    'media/logo.svg',
  ])('does not make %s immutable', (path) => {
    expect(staticCacheControl(path)).toBe('public, max-age=3600');
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

  it('forbids framing through CSP too, and sets nothing else of it yet', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe("frame-ancestors 'none'");
  });
});
