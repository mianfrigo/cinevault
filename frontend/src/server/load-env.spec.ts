import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from './load-env';

// Obviously fake names and values; the process environment is restored after each test.
const SHELL = 'CV_TEST_FROM_SHELL';
const FILE_ONLY = 'CV_TEST_FROM_FILE';

describe('loadEnv', () => {
  let root: string;
  let bundleDir: string;
  let cwd: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-load-env-'));
    bundleDir = join(root, 'dist', 'frontend', 'server'); // three levels below the project folder
    cwd = join(root, 'elsewhere');
    mkdirSync(bundleDir, { recursive: true });
    mkdirSync(cwd);
  });

  afterEach(() => {
    delete process.env[SHELL];
    delete process.env[FILE_ONLY];
    rmSync(root, { recursive: true, force: true });
  });

  it('loads the .env of the project folder, the shell value winning over the file', () => {
    writeFileSync(join(root, '.env'), `${SHELL}=fake-file\n${FILE_ONLY}=fake-only-in-file\n`);
    process.env[SHELL] = 'fake-shell';

    loadEnv(bundleDir, cwd);

    expect(process.env[SHELL]).toBe('fake-shell');
    expect(process.env[FILE_ONLY]).toBe('fake-only-in-file');
  });

  it('falls back to the .env of the working directory', () => {
    writeFileSync(join(cwd, '.env'), `${FILE_ONLY}=fake-from-cwd\n`);

    loadEnv(bundleDir, cwd);

    expect(process.env[FILE_ONLY]).toBe('fake-from-cwd');
  });

  it('is fine without any .env file', () => {
    expect(() => loadEnv(bundleDir, cwd)).not.toThrow();
    expect(process.env[FILE_ONLY]).toBeUndefined();
  });
});
