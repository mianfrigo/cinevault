import { MAX_PAGE, normalisePage } from './page-param';

describe('normalisePage', () => {
  it('passes 1..500 through', () => {
    expect(normalisePage('1')).toBe(1);
    expect(normalisePage('37')).toBe(37);
    expect(normalisePage('500')).toBe(MAX_PAGE);
  });

  it('clamps numbers above the cap and resets everything else to 1', () => {
    expect(normalisePage('501')).toBe(500);
    expect(normalisePage('99999')).toBe(500);
    for (const bad of [undefined, '', '0', '-4', 'abc', '2.5', '1e3', 'NaN', '12abc']) {
      expect(normalisePage(bad)).toBe(1);
    }
  });
});
