import { defineConfig } from '@playwright/test';
import { WEB_ORIGIN } from './stack.mjs';

// The stack (stub TMDB, API, SSR server, reverse proxy) is started by global-setup.ts on its own
// ports, database and Redis index; see stack.mjs. System Google Chrome, headless.
export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_ORIGIN,
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
