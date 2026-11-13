import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads frontend/.env (gitignored) when present, like backend/src/main.ts. Variables already set in the
 * shell win. The built server sits in dist/frontend/server, three levels below the project folder; the
 * dev server and `node dist/...` runs from the project folder find it through the working directory.
 */
export function loadEnv(bundleDir: string): void {
  const file = [join(bundleDir, '../../../.env'), join(process.cwd(), '.env')].find((f) =>
    existsSync(f),
  );
  if (file) process.loadEnvFile(file);
}
