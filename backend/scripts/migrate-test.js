// Applies migrations to the .env.test database (cross-platform; prints no secrets).
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');

const vars = parseEnv(readFileSync(join(__dirname, '..', '.env.test'), 'utf8'));
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true, // npx is npx.cmd on Windows
  env: { ...process.env, DATABASE_URL: vars.DATABASE_URL },
});
process.exit(r.status ?? 1);
