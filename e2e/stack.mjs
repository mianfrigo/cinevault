// The isolated end-to-end stack. It never touches the dev stack (API :3000, ng serve :4200, the
// `cinevault` database, Redis db 0): own ports, own database, own Redis db index.
//
//   node stack.mjs up -- <command...>   build, start, run the command, tear everything down
//   node stack.mjs up                   build and start, stay up until Ctrl-C
//   node stack.mjs down                 drop the e2e database and flush the e2e Redis db
//
// Playwright (global-setup.ts) and lighthouse.mjs call startStack() directly.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxy } from './proxy.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(E2E_DIR, '..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const STACK_DIR = join(E2E_DIR, '.stack');
const LOG_DIR = join(STACK_DIR, 'logs');
// Compiled outside backend/ so the dev dist/ (and the dev watcher) are untouched; a junction to backend/node_modules
// next to it lets Node (also the ESM imports of the generated Prisma client) resolve the packages.
const BACKEND_OUT = join(STACK_DIR, 'backend-dist');
const MODULES_LINK = join(STACK_DIR, 'node_modules');
const COMPOSE = ['compose', '-f', join(ROOT, 'docker-compose.yml')];

export const PORTS = { stub: 4010, api: 3100, ssr: 4301, web: 4300 };
export const DB_NAME = 'cinevault_e2e';
export const REDIS_DB = 5;
const REDIS_MARKER = 'cinevault:e2e-marker';
export const WEB_ORIGIN = `http://localhost:${PORTS.web}`;
export const MAILPIT_SMTP = 'smtp://localhost:1025';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.slice(0, 3).join(' ')} failed (${r.status}): ${(r.stderr || r.stdout || r.error?.message || '').slice(-600)}`,
    );
  }
  return r.stdout;
};
const psql = (sql) =>
  run(
    'docker',
    [
      ...COMPOSE,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'cinevault',
      '-d',
      'postgres',
      '-tAc',
      sql,
    ],
    { cwd: ROOT },
  ).trim();
const redis = (...args) =>
  run('docker', [...COMPOSE, 'exec', '-T', 'redis', 'redis-cli', '-n', String(REDIS_DB), ...args], {
    cwd: ROOT,
  }).trim();

/** Variable names the apps read: dropped from the inherited environment so nothing from a dev shell leaks in. */
const APP_VARS = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'TMDB_READ_TOKEN',
  'TMDB_BASE_URL',
  'JWT_ACCESS_SECRET',
  'WEB_ORIGIN',
  'COOKIE_SECURE',
  'MAIL_FROM',
  'SMTP_URL',
  'FEATURE_DOWNLOAD_BUTTON',
  'THROTTLE_DISABLED',
  'TRUST_PROXY',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASSWORD',
  'NG_ALLOWED_HOSTS',
  'NG_TRUST_PROXY_HEADERS',
  'SITE_URL',
  'API_INTERNAL_URL',
  'PRIMENG_LICENSE_KEY',
  'pm_id',
];
const baseEnv = () => {
  const env = { ...process.env };
  for (const k of APP_VARS) delete env[k];
  return env;
};

const portFree = (port) =>
  new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(false)));
    s.once('error', () => resolve(true));
  });

async function waitFor(url, label, alive, timeoutMs = 90_000) {
  // Failure drill for the teardown paths: E2E_FAIL_AT="API" (or "stub TMDB", "SSR server", "web proxy").
  if (process.env.E2E_FAIL_AT === label)
    throw new Error(`forced failure at ${label} (E2E_FAIL_AT)`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (alive && !alive()) throw new Error(`${label} exited during start (logs: ${LOG_DIR})`);
    if (Date.now() > deadline)
      throw new Error(
        `${label} did not answer on ${url} within ${timeoutMs} ms (logs: ${LOG_DIR})`,
      );
    await new Promise((r) => setTimeout(r, 300));
  }
}

function build() {
  console.log(
    '[stack] building backend (tsc -> e2e/.stack/backend-dist, the dev dist/ is left alone)',
  );
  rmSync(BACKEND_OUT, { recursive: true, force: true });
  run(
    process.execPath,
    [
      join(BACKEND, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.build.json',
      '--outDir',
      BACKEND_OUT,
      '--tsBuildInfoFile',
      join(BACKEND_OUT, '.tsbuildinfo'),
    ],
    { cwd: BACKEND },
  );
  if (!existsSync(MODULES_LINK))
    symlinkSync(join(BACKEND, 'node_modules'), MODULES_LINK, 'junction');
  // The compiled backend is CommonJS; this package is ESM.
  writeFileSync(join(BACKEND_OUT, 'package.json'), '{"type":"commonjs"}');
  console.log('[stack] building frontend (ng build, production)');
  const ngBuild = () =>
    run(process.execPath, [join(FRONTEND, 'node_modules/@angular/cli/bin/ng.js'), 'build'], {
      cwd: FRONTEND,
    });
  try {
    ngBuild();
  } catch (e) {
    // ng build now and then dies with a native crash (exit 3221225477) on this machine; once more is enough.
    console.warn(`[stack] ng build failed (${String(e.message).slice(0, 200)}), retrying once`);
    ngBuild();
  }
}

/** Fresh database and Redis db every run: the seeded admin password is random per run. */
function prepareData(env) {
  if (!/^cinevault_e2e$/.test(DB_NAME))
    throw new Error('refusing to touch a database that is not cinevault_e2e');
  const marker = redis('exists', REDIS_MARKER);
  const size = Number(redis('dbsize'));
  if (size > 0 && marker !== '1') {
    throw new Error(
      `Redis db ${REDIS_DB} holds ${size} keys that are not from the e2e stack; pick another REDIS_DB in e2e/stack.mjs`,
    );
  }
  redis('flushdb');
  redis('set', REDIS_MARKER, '1');
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  psql(`CREATE DATABASE ${DB_NAME} OWNER cinevault`);
  console.log(`[stack] database ${DB_NAME} recreated, redis db ${REDIS_DB} flushed`);
  run(
    process.execPath,
    [join(BACKEND, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: BACKEND, env },
  );
  run(process.execPath, [join(BACKEND, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'], {
    cwd: BACKEND,
    env,
  });
}

export function dropData() {
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  if (redis('exists', REDIS_MARKER) === '1') redis('flushdb');
}

/** Builds (unless E2E_SKIP_BUILD=1), prepares the data, starts the stack. Returns { env, stop }. */
export async function startStack({ skipBuild = process.env.E2E_SKIP_BUILD === '1' } = {}) {
  for (const [name, port] of Object.entries(PORTS)) {
    if (!(await portFree(port)))
      throw new Error(`port ${port} (${name}) is in use; the e2e stack needs it free`);
  }
  if (!skipBuild) build();

  const admin = {
    email: 'admin-e2e@example.test',
    password: randomBytes(18).toString('base64url'),
  };
  const databaseUrl = `postgresql://cinevault:cinevault@localhost:5432/${DB_NAME}`;
  const apiEnv = {
    ...baseEnv(),
    NODE_ENV: 'development', // THROTTLE_DISABLED is refused in production
    PORT: String(PORTS.api),
    DATABASE_URL: databaseUrl,
    REDIS_URL: `redis://localhost:6379/${REDIS_DB}`,
    TMDB_READ_TOKEN: 'e2e-fake-token',
    TMDB_BASE_URL: `http://127.0.0.1:${PORTS.stub}/3`,
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    WEB_ORIGIN,
    COOKIE_SECURE: 'false',
    MAIL_FROM: 'Cinevault E2E <no-reply@example.test>',
    SMTP_URL: MAILPIT_SMTP,
    FEATURE_DOWNLOAD_BUTTON: 'false',
    THROTTLE_DISABLED: 'true',
    TRUST_PROXY: 'false',
    SEED_ADMIN_EMAIL: admin.email,
    SEED_ADMIN_PASSWORD: admin.password,
  };
  prepareData(apiEnv);

  const ssrEnv = {
    ...baseEnv(),
    NODE_ENV: 'production',
    PORT: String(PORTS.ssr),
    NG_ALLOWED_HOSTS: 'localhost',
    SITE_URL: WEB_ORIGIN,
    API_INTERNAL_URL: `http://127.0.0.1:${PORTS.api}`,
    PRIMENG_LICENSE_KEY: '', // set (empty) so a developer's frontend/.env key is not picked up
  };

  mkdirSync(LOG_DIR, { recursive: true });
  const children = [];
  let stopping = false;
  const start = (name, script, args, cwd, env) => {
    const out = openSync(join(LOG_DIR, `${name}.log`), 'w');
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env,
      stdio: ['ignore', out, out],
      windowsHide: true,
    });
    closeSync(out);
    children.push({ name, child });
    child.once('error', (e) => console.error(`[stack] ${name} failed to start: ${e.message}`));
    child.once(
      'exit',
      (code) =>
        code &&
        !stopping &&
        console.error(`[stack] ${name} exited with ${code} (see ${join(LOG_DIR, `${name}.log`)})`),
    );
  };

  const proxy = createProxy({ web: PORTS.web, api: PORTS.api, ssr: PORTS.ssr });
  // Idempotent, and safe when only part of the stack was started.
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    stopping = true;
    if (proxy.listening) await new Promise((r) => proxy.close(r));
    proxy.closeAllConnections?.();
    for (const { child } of children) {
      if (child.exitCode !== null || child.pid === undefined) continue;
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
    console.log('[stack] stopped');
  };

  try {
    start('stub-tmdb', join(E2E_DIR, 'stub-tmdb.mjs'), [String(PORTS.stub)], E2E_DIR, baseEnv());
    start('api', join(BACKEND_OUT, 'main.js'), [], BACKEND, apiEnv);
    await waitFor(`http://127.0.0.1:${PORTS.stub}/3/genre/movie/list`, 'stub TMDB');
    await waitFor(
      `http://127.0.0.1:${PORTS.api}/api/v1/health`,
      'API',
      () => children[1].child.exitCode === null,
    );
    start('ssr', join(FRONTEND, 'dist/frontend/server/server.mjs'), [], FRONTEND, ssrEnv);
    await waitFor(
      `http://localhost:${PORTS.ssr}/`,
      'SSR server',
      () => children[2].child.exitCode === null,
    );
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(PORTS.web, () => {
        proxy.off('error', reject); // a failed listen is the only error worth rejecting for
        resolve();
      });
    });
    await waitFor(`${WEB_ORIGIN}/api/v1/health`, 'web proxy');
  } catch (e) {
    await stop();
    throw e;
  }
  console.log(
    `[stack] up: ${WEB_ORIGIN} (api :${PORTS.api}, ssr :${PORTS.ssr}, stub :${PORTS.stub}, db ${DB_NAME}, redis /${REDIS_DB})`,
  );
  return { stop, adminEmail: admin.email, adminPassword: admin.password, origin: WEB_ORIGIN };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'down') {
    dropData();
    if (existsSync(MODULES_LINK)) rmdirSync(MODULES_LINK); // the junction only, never backend/node_modules
    rmSync(STACK_DIR, { recursive: true, force: true });
    console.log(`[stack] dropped database ${DB_NAME} and flushed redis db ${REDIS_DB}`);
  } else if (cmd === 'up') {
    const stack = await startStack();
    const exit = async (code) => (await stack.stop(), process.exit(code));
    const command = rest.slice(rest[0] === '--' ? 1 : 0);
    if (command.length) {
      const r = spawnSync(command[0], command.slice(1), {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          E2E_ADMIN_EMAIL: stack.adminEmail,
          E2E_ADMIN_PASSWORD: stack.adminPassword,
        },
      });
      await exit(r.status ?? 1);
    }
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => exit(0));
    console.log('[stack] Ctrl-C to stop');
  } else {
    console.error('usage: node stack.mjs up [-- command...] | down');
    process.exit(2);
  }
}
