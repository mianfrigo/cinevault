import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Aura from '@primeuix/themes/aura';
import cinevaultPreset, { buildCinevaultPreset } from './cinevault-preset';

/** `primeng/<module>` imports that need no design tokens, or tokens under another key. */
const TOKENS_FOR: Record<string, string[]> = {
  api: [],
  config: [],
  inputicon: [],
  table: ['datatable'],
  selectbutton: ['selectbutton', 'togglebutton'],
  password: ['password', 'inputtext'],
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : [];
  });
}

const appDir = join(__dirname, '..');
const usedModules = [
  ...new Set(
    sources(appDir).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/from 'primeng\/([a-z]+)'/g)].map((m) => m[1]),
    ),
  ),
];
type Components = Record<string, unknown>;
const slim = cinevaultPreset.components as Components;
const fullPreset = buildCinevaultPreset(Aura);
const full = fullPreset.components as Components;

describe('cinevault preset', () => {
  it('finds the PrimeNG modules the app uses', () => {
    expect(usedModules).toContain('button');
  });

  it.each(usedModules)(
    'has design tokens for primeng/%s, identical to the full Aura preset',
    (module) => {
      for (const key of TOKENS_FOR[module] ?? [module]) {
        expect(
          slim[key],
          `no "${key}" tokens: add the Aura "${key}" preset to cinevault-preset.ts`,
        ).toBeDefined();
        expect(slim[key]).toEqual(full[key]);
      }
    },
  );

  it('keeps the primitive and semantic tokens of Aura', () => {
    expect(cinevaultPreset.primitive).toEqual(fullPreset.primitive);
    expect(cinevaultPreset.semantic).toEqual(fullPreset.semantic);
  });

  it('does not carry the tokens of components the app never imports', () => {
    expect(slim['tree']).toBeUndefined();
  });
});
