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
