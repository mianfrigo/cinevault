import { mediaTypeLabel, titleAlt, titleMeta } from './title-format';

describe('title format', () => {
  it('names the media type', () => {
    expect(mediaTypeLabel('movie')).toBe('Movie');
    expect(mediaTypeLabel('tv')).toBe('Series');
  });

  it('builds the alt text with the year when there is one', () => {
    expect(titleAlt({ title: 'Dune', year: 2021 })).toBe('Dune (2021)');
    expect(titleAlt({ title: 'Dune', year: null })).toBe('Dune');
  });

  it('builds the meta line with the year when there is one', () => {
    expect(titleMeta({ mediaType: 'movie', year: 2021 })).toBe('2021 · Movie');
    expect(titleMeta({ mediaType: 'tv', year: 2021 })).toBe('2021 · Series');
    expect(titleMeta({ mediaType: 'tv', year: null })).toBe('Series');
  });
});
