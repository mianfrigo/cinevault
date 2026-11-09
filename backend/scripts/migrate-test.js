// Applies migrations to the .env.test database (cross-platform; prints no secrets).
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');

const vars = parseEnv(readFileSync(join(__dirname, '..', '.env.test'), 'utf8'));
// Same guard as test/setup-env.ts (duplicated: that file is TS under Jest), but it must
// run here first so migrations never touch a non-test database.
let dbName = '';
try {
  dbName = new URL(vars.DATABASE_URL ?? '').pathname.slice(1);
} catch {
  // falls through to the error below
}
if (!dbName.endsWith('_test')) {
  console.error(
    'Refusing to migrate: .env.test DATABASE_URL must be set and name a database ending in _test',
  );
  process.exit(1);
}
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true, // npx is npx.cmd on Windows
  env: { ...process.env, DATABASE_URL: vars.DATABASE_URL },
});
process.exit(r.status ?? 1);
