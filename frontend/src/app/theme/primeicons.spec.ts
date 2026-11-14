import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|html)$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
  });
}

// styles/primeicons.css carries only the icons the app uses (its header says how to add one).
const css = readFileSync(join(__dirname, '../../styles/primeicons.css'), 'utf8');
const inCss = new Set([...css.matchAll(/\.(pi-[a-z0-9-]+):before/g)].map((m) => m[1]));
const used = new Set(
  sources(join(__dirname, '..')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/\bpi-([a-z0-9-]+)/g)].map((m) => 'pi-' + m[1]),
  ),
);
// Modifier classes, not glyphs.
used.delete('pi-spin');
used.delete('pi-fw');

describe('PrimeIcons subset', () => {
  it('finds the icons the app uses', () => {
    expect(used).toContain('pi-heart');
  });

  it.each([...used])('has a rule for %s', (name) => {
    expect(
      inCss,
      `${name} is not in styles/primeicons.css: add it and re-subset the font`,
    ).toContain(name);
  });
});
