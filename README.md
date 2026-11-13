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

`e2e/` is its own small package (Playwright, headless system Google Chrome). One command builds the backend and the frontend (production), starts an isolated stack, runs the smoke and tears everything down:

```bash
docker compose up -d          # postgres, redis and mailpit must be up (Mailpit is where the verification mail is read)
cd e2e
npm install                   # first time only
npm test                      # = playwright test; E2E_SKIP_BUILD=1 reuses the last build
```

Prerequisites: the compose services, Node 24, and Google Chrome installed on the machine (no Playwright browser download).

What it starts, all on its own ports, so it never touches the dev stack (API `:3000`, `ng serve` `:4200`, database `cinevault`, Redis db `0`):

| Piece                       | Where                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Stub TMDB (fixture JSON)    | `http://127.0.0.1:4010/3` (`e2e/stub-tmdb.mjs`; the id `999999` answers 404, `500500` answers 500)                                       |
| API (`THROTTLE_DISABLED`)   | `:3100`, database `cinevault_e2e` (recreated on every run, migrated, admin seeded with a random password), Redis db `5`, SMTP to Mailpit |
| SSR server (production)     | `:4301`, `API_INTERNAL_URL` = the API above, `NG_ALLOWED_HOSTS=localhost`                                                                |
| Reverse proxy, the web port | `http://localhost:4300` (`/api/**` to the API, everything else to the SSR server, brotli/gzip like a real proxy)                         |

The smoke registers a user through the UI, reads the verification link from Mailpit's HTTP API, logs in, adds a title to My List, checks Favorites and logs out; then the seeded admin blocks that user through Admin / Users and the blocked user's very next API call is refused (`403 ACCOUNT_BLOCKED`), plus a few checks of HTTP statuses and headers. It deletes the user it created and only the Mailpit messages sent to its own `@example.test` address; the rest of the shared mailbox is never read or deleted. Logs of the stack are in `e2e/.stack/logs`.

- `npm run stack:up` builds and keeps the stack running (Ctrl-C stops it); `npm run stack:down` drops the `cinevault_e2e` database and flushes Redis db 5 (only needed after a crashed run).
- `npm run lighthouse [-- 3 --4g]` runs Lighthouse (mobile, simulated throttling) against the production build on `/` and `/title/movie/603`; results and sizes are in [docs/launch-checklist.md](docs/launch-checklist.md).
- The backend is compiled to `e2e/.stack/backend-dist` (not `backend/dist`), so a running `nest start --watch` is not disturbed.
