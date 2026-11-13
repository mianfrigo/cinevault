// The isolated end-to-end stack. It never touches the dev stack (API :3000, ng serve :4200, the
// `cinevault` database, Redis db 0): own ports (all bound to 127.0.0.1), own database, own Redis db
// index, own build output under e2e/.stack (nothing is written to backend/dist or frontend/dist).
//
//   node stack.mjs up -- <command...>   build, start, run the command, tear everything down
//   node stack.mjs up                   build and start, stay up until Ctrl-C
//   node stack.mjs down                 stop leftovers, drop the e2e database, flush the e2e Redis db
//
// Playwright (global-setup.ts) and lighthouse.mjs call startStack() directly.
// Test-only drill hooks: E2E_FAIL_AT=<stage> forces a failure and E2E_SIGNAL_AT=<stage> behaves as a
// Ctrl-C at that stage, with <stage> one of: build, ng build, stub TMDB, API, SSR server, web proxy.
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
// The production frontend is built here too (not frontend/dist), with its own junction to frontend/node_modules.
const FRONTEND_OUT = join(STACK_DIR, 'frontend');
const FRONTEND_MODULES_LINK = join(FRONTEND_OUT, 'node_modules');
const LOOPBACK = join(E2E_DIR, 'loopback.cjs');
const COMPOSE = ['compose', '-f', join(ROOT, 'docker-compose.yml')];

export const PORTS = { stub: 4010, api: 3100, ssr: 4301, web: 4300 };
const EXTRA_PORTS = [4011]; // lighthouse.mjs: the image server
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

/**
 * Cleanup that must run however the process ends. The handlers are installed before the first build, so
 * Ctrl-C (SIGINT, SIGBREAK) or SIGTERM during the build or the startup still stops whatever was started.
 * Windows cannot deliver SIGTERM or a forced taskkill to a handler: after that, run `npm run stack:down`,
 * which also stops leftover e2e processes.
 */
const cleanups = new Set();
let handlersInstalled = false;
/** Registers cleanup for the signal handlers (and installs them); returns the unregister function. */
export function registerCleanup(fn) {
  installShutdownHandlers();
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}
function installShutdownHandlers() {
  if (handlersInstalled) return;
  handlersInstalled = true;
  let shuttingDown = false;
  const signals = [
    'SIGINT',
    'SIGTERM',
    'SIGHUP',
    ...(process.platform === 'win32' ? ['SIGBREAK'] : []),
  ];
  for (const sig of signals) {
    process.on(sig, async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.error(`[stack] ${sig}: stopping what was started`);
      for (const fn of [...cleanups]) await fn().catch(() => undefined);
      process.exit(130);
    });
  }
}
const killTree = (child) => {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function drillSignal(label, delayMs = 0) {
  if (process.env.E2E_SIGNAL_AT !== label) return;
  await sleep(delayMs);
  process.emit('SIGINT');
  await sleep(30_000); // the handler exits the process
}

/** spawn that resolves when the command succeeds; the child is tracked so a shutdown kills it. */
function runAsync(children, name, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.push({ name, child });
    let tail = '';
    const keep = (d) => (tail = (tail + d).slice(-600));
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} failed (${code}): ${tail}`)),
    );
  });
}

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
  // Failure drills for the teardown paths (test-only): see the header.
  if (process.env.E2E_FAIL_AT === label)
    throw new Error(`forced failure at ${label} (E2E_FAIL_AT)`);
  await drillSignal(label);
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
    await sleep(300);
  }
}

async function build(children) {
  await drillSignal('build');
  console.log(
    '[stack] building backend (tsc -> e2e/.stack/backend-dist, the dev dist/ is left alone)',
  );
  rmSync(BACKEND_OUT, { recursive: true, force: true });
  await runAsync(
    children,
    'tsc',
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

  // ng build empties its output folder: unlink the junction first so nothing can follow it.
  if (existsSync(FRONTEND_MODULES_LINK)) rmdirSync(FRONTEND_MODULES_LINK);
  console.log('[stack] building frontend (ng build, production -> e2e/.stack/frontend)');
  const ngBuild = () =>
    runAsync(
      children,
      'ng build',
      process.execPath,
      [
        join(FRONTEND, 'node_modules/@angular/cli/bin/ng.js'),
        'build',
        '--output-path',
        FRONTEND_OUT,
      ],
      // NG_BUILD_CACHE=false: do not write into the developer's frontend/.angular cache.
      { cwd: FRONTEND, env: { ...process.env, NG_BUILD_CACHE: 'false' } },
    );
  try {
    // 'ng build' drill: the signal arrives while the build child runs.
    await Promise.all([ngBuild(), drillSignal('ng build', 4000)]);
  } catch (e) {
    // ng build now and then dies with a native crash (exit 3221225477) on this machine; once more is enough.
    console.warn(`[stack] ng build failed (${String(e.message).slice(0, 200)}), retrying once`);
    await ngBuild();
  }
  // The server bundle imports express and friends: resolve them from frontend/node_modules.
  if (!existsSync(FRONTEND_MODULES_LINK))
    symlinkSync(join(FRONTEND, 'node_modules'), FRONTEND_MODULES_LINK, 'junction');
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
  // These two run in backend/ and use their own process.loadEnvFile (prisma.config.ts, prisma/seed.ts):
  // shell values win, and APP_VARS covers every variable they read, so nothing from a .env leaks in.
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

/** Stops e2e processes that still listen on the e2e ports (a run that was force-killed). Windows only. */
function killLeftovers() {
  if (process.platform !== 'win32') return;
  const ports = [...Object.values(PORTS), ...EXTRA_PORTS].join(',');
  const script = `
    $dir = '${E2E_DIR.replace(/'/g, "''")}'
    Get-NetTCPConnection -State Listen -LocalPort ${ports} -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
      if ($p -and ($p.CommandLine -like "*$dir*" -or $p.CommandLine -match 'stack\\.mjs|lighthouse\\.mjs')) {
        Write-Output "stopping leftover pid $($p.ProcessId) on port $($_.LocalPort)"
        taskkill /PID $p.ProcessId /T /F | Out-Null
      }
    }`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  if (r.stdout.trim()) console.log(r.stdout.trim());
}

export function dropData() {
  psql(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  if (redis('exists', REDIS_MARKER) === '1') redis('flushdb');
}

/** Builds (unless E2E_SKIP_BUILD=1), prepares the data, starts the stack. Returns { stop, ... }. */
export async function startStack({ skipBuild = process.env.E2E_SKIP_BUILD === '1' } = {}) {
  installShutdownHandlers();
  const children = [];
  let stopping = false;
  let stopped = false;
  const proxy = createProxy({ web: PORTS.web, api: PORTS.api, ssr: PORTS.ssr });
  const killChildren = () => children.forEach(({ child }) => killTree(child));
  // Idempotent, and safe when only part of the stack was started (or nothing yet: during the build).
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    stopping = true;
    cleanups.delete(stop);
    if (proxy.listening) await new Promise((r) => proxy.close(r));
    proxy.closeAllConnections?.();
    killChildren();
    console.log('[stack] stopped');
  };
  cleanups.add(stop);
  process.once('exit', killChildren); // last resort for an uncaught exception
  const child = (name) => children.find((c) => c.name === name).child;

  const start = (name, script, args, cwd, env, preload = []) => {
    const out = openSync(join(LOG_DIR, `${name}.log`), 'w');
    const proc = spawn(process.execPath, [...preload, script, ...args], {
      cwd,
      env,
      stdio: ['ignore', out, out],
      windowsHide: true,
    });
    closeSync(out);
    children.push({ name, child: proc });
    proc.once('error', (e) => console.error(`[stack] ${name} failed to start: ${e.message}`));
    proc.once(
      'exit',
      (code) =>
        code &&
        !stopping &&
        console.error(`[stack] ${name} exited with ${code} (see ${join(LOG_DIR, `${name}.log`)})`),
    );
  };

  try {
    for (const [name, port] of Object.entries(PORTS)) {
      if (!(await portFree(port)))
        throw new Error(
          `port ${port} (${name}) is in use; the e2e stack needs it free (a killed run? try npm run stack:down)`,
        );
    }
    mkdirSync(LOG_DIR, { recursive: true });
    if (!skipBuild) await build(children);

    const admin = {
      email: 'admin-e2e@example.test',
      password: randomBytes(18).toString('base64url'),
    };
    const apiEnv = {
      ...baseEnv(),
      NODE_ENV: 'development', // THROTTLE_DISABLED is refused in production
      PORT: String(PORTS.api),
      DATABASE_URL: `postgresql://cinevault:cinevault@localhost:5432/${DB_NAME}`,
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

    // The API and SSR run from e2e/.stack (not backend/ or frontend/), so their own `.env` lookups find
    // nothing: main.ts and load-env.ts look beside the build output and in the working directory.
    start('stub-tmdb', join(E2E_DIR, 'stub-tmdb.mjs'), [String(PORTS.stub)], E2E_DIR, baseEnv());
    start('api', join(BACKEND_OUT, 'main.js'), [], STACK_DIR, apiEnv, ['--require', LOOPBACK]);
    await waitFor(`http://127.0.0.1:${PORTS.stub}/3/genre/movie/list`, 'stub TMDB');
    await waitFor(
      `http://127.0.0.1:${PORTS.api}/api/v1/health`,
      'API',
      () => child('api').exitCode === null,
    );
    start('ssr', join(FRONTEND_OUT, 'server/server.mjs'), [], FRONTEND_OUT, ssrEnv, [
      '--require',
      LOOPBACK,
    ]);
    await waitFor(
      `http://localhost:${PORTS.ssr}/`,
      'SSR server',
      () => child('ssr').exitCode === null,
    );
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(PORTS.web, '127.0.0.1', () => {
        proxy.off('error', reject); // only a failed listen is worth rejecting for
        resolve();
      });
    });
    await waitFor(`${WEB_ORIGIN}/api/v1/health`, 'web proxy');
    console.log(
      `[stack] up: ${WEB_ORIGIN} (api :${PORTS.api}, ssr :${PORTS.ssr}, stub :${PORTS.stub}, db ${DB_NAME}, redis /${REDIS_DB})`,
    );
    return { stop, adminEmail: admin.email, adminPassword: admin.password, origin: WEB_ORIGIN };
  } catch (e) {
    await stop();
    throw e;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'down') {
    killLeftovers();
    dropData();
    for (const link of [MODULES_LINK, FRONTEND_MODULES_LINK]) if (existsSync(link)) rmdirSync(link); // the junctions only, never the node_modules they point to
    rmSync(STACK_DIR, { recursive: true, force: true });
    console.log(`[stack] dropped database ${DB_NAME} and flushed redis db ${REDIS_DB}`);
  } else if (cmd === 'up') {
    installShutdownHandlers();
    const stack = await startStack();
    const command = rest.slice(rest[0] === '--' ? 1 : 0);
    if (command.length) {
      // async, so a signal during the command still reaches the handlers
      const code = await new Promise((resolve) => {
        const p = spawn(command.join(' '), {
          stdio: 'inherit',
          shell: process.platform === 'win32',
          env: {
            ...process.env,
            E2E_ADMIN_EMAIL: stack.adminEmail,
            E2E_ADMIN_PASSWORD: stack.adminPassword,
          },
        });
        p.once('close', (c) => resolve(c ?? 1));
      });
      await stack.stop();
      process.exit(code);
    }
    console.log('[stack] Ctrl-C to stop');
  } else {
    console.error('usage: node stack.mjs up [-- command...] | down');
    process.exit(2);
  }
}
