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

const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!dbName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL database "${dbName}" must end with _test`,
  );
}
