import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// Loads .env.test into process.env.
// process.loadEnvFile is not used: jest's sandboxed process does not see its writes.
const vars = parseEnv(readFileSync(join(__dirname, '..', '.env.test'), 'utf8'));
for (const [k, v] of Object.entries(vars)) {
  // Data stores always come from .env.test so a shell DATABASE_URL can never hit real data.
  if (k === 'DATABASE_URL' || k === 'REDIS_URL') process.env[k] = v;
  else process.env[k] ??= v;
}

/** Path of a required URL variable; errors name the variable, never its value. */
function urlPath(name: 'DATABASE_URL' | 'REDIS_URL'): string {
  const value = process.env[name];
  if (!value || !URL.canParse(value)) {
    throw new Error(
      `Refusing to run tests: ${name} is missing or not a valid URL`,
    );
  }
  return new URL(value).pathname.slice(1);
}

// Tests flush Redis, so they must use a dedicated, non-default database index.
if (!/^[1-9]\d*$/.test(urlPath('REDIS_URL'))) {
  throw new Error(
    'Refusing to run tests: REDIS_URL must select a non-zero database (e.g. /1)',
  );
}

// Also checked by scripts/migrate-test.js before migrations run; keep both in sync.
const dbName = urlPath('DATABASE_URL');
if (!dbName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL database "${dbName}" must end with _test`,
  );
}
