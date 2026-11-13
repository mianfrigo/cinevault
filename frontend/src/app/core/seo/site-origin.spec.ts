import { siteOriginFrom } from './site-origin';

const request = new Request('https://cinevault.test/title/movie/603?x=1');

describe('siteOriginFrom', () => {
  it('prefers the configured SITE_URL, reduced to its origin', () => {
    expect(siteOriginFrom('https://www.cinevault.example/some/path', request)).toBe(
      'https://www.cinevault.example',
    );
  });

  it('falls back to the request origin', () => {
    expect(siteOriginFrom(undefined, request)).toBe('https://cinevault.test');
  });

  it('ignores a SITE_URL that is not an http(s) URL', () => {
    expect(siteOriginFrom('javascript:alert(1)', request)).toBe('https://cinevault.test');
    expect(siteOriginFrom('not a url', null)).toBe('http://localhost:4200');
  });

  it('uses localhost when there is nothing else', () => {
    expect(siteOriginFrom(undefined, null)).toBe('http://localhost:4200');
  });
});
