import { shortName } from './short-name';

describe('shortName', () => {
  it('keeps the first name and the initial of the last one', () => {
    expect(shortName('Alex Mercer')).toBe('Alex M.');
    expect(shortName('Mary Jane watson')).toBe('Mary W.');
  });

  it('leaves a single name as it is and ignores extra spaces', () => {
    expect(shortName('Cher')).toBe('Cher');
    expect(shortName('  Alex   Mercer ')).toBe('Alex M.');
  });

  it('is empty for an empty name', () => {
    expect(shortName('')).toBe('');
  });
});
