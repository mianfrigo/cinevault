import { transferCacheOriginMap } from './transfer-cache-origin';

describe('transferCacheOriginMap', () => {
  it('maps the internal API origin to the origin the page was requested on', () => {
    const request = new Request('https://cinevault.example/title/movie/603?x=1');
    expect(transferCacheOriginMap('http://api.internal:3000', request)).toEqual({
      'http://api.internal:3000': 'https://cinevault.example',
    });
  });

  it('ignores a path or trailing slash on the internal URL', () => {
    const request = new Request('http://localhost:4200/');
    expect(transferCacheOriginMap('http://localhost:3000/', request)).toEqual({
      'http://localhost:3000': 'http://localhost:4200',
    });
  });

  it('maps nothing without a request (no origin to match)', () => {
    expect(transferCacheOriginMap('http://localhost:3000', null)).toEqual({});
  });
});
