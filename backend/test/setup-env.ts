import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// Loads .env.test into process.env (variables already set win).
// process.loadEnvFile is not used: jest's sandboxed process does not see its writes.
const vars = parseEnv(readFileSync(join(__dirname, '..', '.env.test'), 'utf8'));
for (const [k, v] of Object.entries(vars)) process.env[k] ??= v;
