import { BACKDROP_SIZES, backdropSrcset } from './tmdb-image';

describe('backdropSrcset', () => {
  const url = 'https://image.tmdb.org/t/p/w1280/abc123.jpg';

  it('lists the same picture at each backdrop width, keyed by TMDB size', () => {
    expect(backdropSrcset(url)).toBe(
      'https://image.tmdb.org/t/p/w780/abc123.jpg 780w, https://image.tmdb.org/t/p/w1280/abc123.jpg 1280w',
    );
  });

  it('offers a phone-sized picture first, so a narrow screen does not download the 1280 px one', () => {
    expect(BACKDROP_SIZES[0]).toBeLessThan(BACKDROP_SIZES[BACKDROP_SIZES.length - 1]);
  });

  it('returns null for no URL or for a URL that is not a TMDB image', () => {
    expect(backdropSrcset(null)).toBeNull();
    expect(backdropSrcset('https://example.test/photo.jpg')).toBeNull();
  });
});
