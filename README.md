# Cinevault

Movie and series catalog backed by TMDB. NestJS API (`backend/`) and an Angular SSR frontend (`frontend/`, added later). Specs and plan live in `docs/`.

## Run locally

Requires Node 22 or newer (`.nvmrc` pins 24) and Docker.

```bash
docker compose up -d          # postgres (cinevault, cinevault_test), redis, mailpit (UI http://localhost:8025)
cd backend
npm install
cp .env.example .env          # then set TMDB_READ_TOKEN and JWT_ACCESS_SECRET
npm run db:deploy             # apply migrations
npm run db:seed               # create the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env
npm run start:dev             # http://localhost:3000/api/v1/health
```

The seed is safe to re-run: an existing verified account with that email is promoted to ADMIN (active) and keeps its password. An unverified one (someone registered that address first) is taken over: it gets the seed password and its sessions and pending email tokens are deleted. Choose a strong `SEED_ADMIN_PASSWORD` (10 to 128 characters) and never commit it.

Behind a reverse proxy set `TRUST_PROXY=1` (the number of proxies in front of the API) so rate limits use the real client IP. Do not use `TRUST_PROXY=true` in production: it trusts the whole `X-Forwarded-For` header, so a client can fake its IP and dodge the limits.

Tests (use `backend/.env.test`, no real secrets):

```bash
npm test                      # unit
npm run test:e2e              # e2e
```

## End-to-end smoke

`e2e/` is its own small package (Playwright, headless Google Chrome). One command builds the backend and the frontend (production), starts an isolated stack, runs the smoke and stops everything it started:

```bash
docker compose up -d          # postgres, redis and mailpit must be up (Mailpit is where the verification mail is read)
cd e2e
npm install                   # first time only
npm test                      # = playwright test; E2E_SKIP_BUILD=1 reuses the last build
```

Prerequisites: the compose services, Node 24, and Google Chrome installed on the machine (no Playwright browser download).

What it starts, all on its own ports and bound to `127.0.0.1` only (the stack runs with `THROTTLE_DISABLED`, so it must not be reachable from the network), so it never touches the dev stack (API `:3000`, `ng serve` `:4200`, database `cinevault`, Redis db `0`):

| Piece                       | Where                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stub TMDB (fixture JSON)    | `http://127.0.0.1:4010/3` (`e2e/stub-tmdb.mjs`; the id `999999` answers 404, `500500` answers 500)                                                    |
| API (`THROTTLE_DISABLED`)   | `:3100`, database `cinevault_e2e` (recreated at the start of every run, migrated, admin seeded with a random password), Redis db `5`, SMTP to Mailpit |
| SSR server (production)     | `:4301`, `API_INTERNAL_URL` = the API above, `NG_ALLOWED_HOSTS=localhost`                                                                             |
| Reverse proxy, the web port | `http://localhost:4300` (`/api/**` to the API, everything else to the SSR server, brotli/gzip like a real proxy)                                      |

The smoke registers a user through the UI, reads the verification link from Mailpit's HTTP API, logs in, adds a title to My List, checks Favorites and logs out; then the seeded admin blocks that user through Admin / Users and the blocked user's very next API call is refused (`403 ACCOUNT_BLOCKED`), plus a few checks of HTTP statuses and headers. It deletes the user it created and only the Mailpit messages sent to its own `@example.test` address (the Mailpit helper refuses any other address); the rest of the shared mailbox is never read or deleted. Logs of the stack are in `e2e/.stack/logs`.

- **Nothing in the dev setup is overwritten.** The backend is compiled to `e2e/.stack/backend-dist` and the frontend is built to `e2e/.stack/frontend` (not `backend/dist` or `frontend/dist`), so a running `nest start --watch` or `ng serve` is not disturbed. `ng build` still rewrites one file of the shared Angular cache (`frontend/.angular/cache/<version>/frontend/.tsbuildinfo`, TypeScript incremental state), which is harmless.
- **`.env` files.** The e2e code never reads any `.env`. The spawned apps have their own `process.loadEnvFile` calls: `backend/prisma.config.ts` and `backend/prisma/seed.ts` (the stack runs them for the migration and the seed), and `backend/src/main.ts` and `frontend/src/server/load-env.ts` (they look beside the build output and in the working directory, and find nothing because the API and SSR processes run from `e2e/.stack`). Shell values always win there, and the stack sets (or removes) every variable those apps read, so nothing from a `.env` reaches the run.
- **After a normal run** the stack is stopped, but the `cinevault_e2e` database and the Redis db 5 contents stay until the next run (which recreates them) or `npm run stack:down`.
- **If a run was killed** (a force-kill, a crash) and the next one says a port is in use: `npm run stack:down` stops leftover e2e processes on the e2e ports, drops `cinevault_e2e`, flushes Redis db 5 and removes `e2e/.stack`. Ctrl-C and SIGTERM during the build or the startup stop everything that was started. (Windows delivers no handler for a forced kill; there the child processes still die with their parent.)
- `npm run stack:up` builds and keeps the stack running (Ctrl-C stops it).
- `npm run lighthouse [-- 3 --4g]` runs Lighthouse (mobile, simulated throttling) against the production build on `/` and `/title/movie/603` (`--4g`: a 9 Mbps profile); raw reports go to the gitignored `e2e/.lighthouse`; results and sizes are in [docs/launch-checklist.md](docs/launch-checklist.md).
- `npm run unit` (Mailpit helper checks), `npm run format:check` and `npm run typecheck` check the e2e package itself.
- `E2E_FAIL_AT=<stage>` and `E2E_SIGNAL_AT=<stage>` are test-only drill hooks of `e2e/stack.mjs`: they force a failure, or behave as a Ctrl-C, at one of the stages `build`, `ng build`, `stub TMDB`, `API`, `SSR server`, `web proxy`, to prove that the teardown leaves nothing running. Do not set them otherwise.
