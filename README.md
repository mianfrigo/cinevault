# Cinevault

Movie and series catalog backed by TMDB. NestJS API (`backend/`) and an Angular SSR frontend (`frontend/`, added later). Specs and plan live in `docs/`.

## Run locally

Requires Node 22 or newer (`.nvmrc` pins 24) and Docker.

```bash
docker compose up -d          # postgres (cinevault, cinevault_test), redis, mailpit (UI http://localhost:8025)
cd backend
npm install
cp .env.example .env          # then set TMDB_READ_TOKEN and JWT_ACCESS_SECRET
npm run start:dev             # http://localhost:3000/api/v1/health
```

Tests (use `backend/.env.test`, no real secrets):

```bash
npm test                      # unit
npm run test:e2e              # e2e
```
