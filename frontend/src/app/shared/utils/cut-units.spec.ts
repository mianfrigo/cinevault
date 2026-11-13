import { cutUnits } from './cut-units';

describe('cutUnits', () => {
  it('returns text that already fits', () => {
    expect(cutUnits('abc', 3)).toBe('abc');
  });

  it('cuts to the limit', () => {
    expect(cutUnits('abcdef', 4)).toBe('abcd');
  });

  it('never splits a surrogate pair', () => {
    expect(cutUnits('a😀b', 2)).toBe('a');
    expect(cutUnits('a😀b', 3)).toBe('a😀');
  });
});
