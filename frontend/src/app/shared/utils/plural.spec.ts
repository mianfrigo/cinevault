import { plural } from './plural';

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'title')).toBe('title');
  });

  it('uses the plural for zero and for more than one', () => {
    expect(plural(0, 'title')).toBe('titles');
    expect(plural(2, 'title')).toBe('titles');
    expect(plural(11, 'season')).toBe('seasons');
  });

  it('takes an irregular plural', () => {
    expect(plural(1, 'person', 'people')).toBe('person');
    expect(plural(3, 'person', 'people')).toBe('people');
  });
});
