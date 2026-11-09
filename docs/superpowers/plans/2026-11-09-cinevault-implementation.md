# Cinevault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Cinevault: a public TMDB-backed movie and series catalog with verified accounts, favorites, and an admin user-management area.

**Architecture:** A NestJS REST API (`backend/`) owns all TMDB access, caching (Redis), auth (JWT access + rotating refresh cookie), favorites and admin. An Angular SSR app (`frontend/`) renders the public catalog server-side and the dashboards in the browser. PostgreSQL via Prisma stores users, tokens and favorites only.

**Tech Stack:** Node active LTS (22+), NestJS 11, Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`), PostgreSQL, Redis (`@nestjs/cache-manager` + `@keyv/redis`), `@nestjs/jwt`, `argon2`, `@nestjs/throttler`, `nodemailer`, Angular (latest stable, `ng new --ssr`), PrimeNG (UI components, themed by a custom preset), Tailwind CSS v4 (all styling), NgRx SignalStore (`@ngrx/signals`) for global and page-interaction state, Jest + Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-cinevault-design.md`. Detail docs, all authoritative for their area: `docs/PRD.md`, `docs/TRD.md`, `docs/backend-schema.md` (schema and API contract, names below follow it exactly), `docs/app-flow.md`, `docs/ux-design-brief.md`. Approved visual mockup: `docs/design/directions/a2-streamline-premium.html`.

## Global Constraints

- Project root `C:\Users\darks\Desktop\Cinevault`; apps in `backend/` and `frontend/`; docs in `docs/`.
- English only; TMDB `language=en-US`; `include_adult=false` on every TMDB list, search and discover call.
- TMDB token only on the server (`TMDB_READ_TOKEN`); never sent to the browser or logged.
- Footer text on every page, verbatim: `This product uses the TMDB API but is not endorsed or certified by TMDB.`
- Download button renders only when `GET /config` returns `features.downloadButton === true`; default `false` (`FEATURE_DOWNLOAD_BUTTON`); it performs no download.
- Roles `USER` and `ADMIN` only. Sign-up requires email verification before login.
- Password min 10, max 128 chars, argon2id. Access token 10 min; refresh token 30 days, httpOnly cookie `cv_refresh`, Secure in production, SameSite=Lax, path `/api/v1/auth`. Access token kept in memory only.
- API base path `/api/v1`; error body `{ statusCode, code, message }`.
- Cache TTLs: details, season, genres 24h; trending, popular, top-rated, new, discover 1h; search 10 min.
- Rate limits: global 100/min/IP; login, register, forgot-password, resend-verification 5/min/IP.
- Frontend UI uses PrimeNG components wherever one exists (no hand-built buttons, inputs, selects, tables, dialogs, toasts, accordions; the hero carousel and the paginator are the owner-approved exceptions and are built from scratch with Tailwind and signals) and Tailwind CSS v4 utilities for layout and styling; no custom component CSS unless Tailwind and PrimeNG tokens cannot express it (then a one-line comment says why). Design values (colors, fonts, radii, easing, breakpoints) live only in `frontend/src/styles/theme.css` (`@theme`) and the PrimeNG preset `frontend/src/app/theme/cinevault-preset.ts`; no raw hex in templates. NgRx SignalStore only where `docs/TRD.md` section 4.2 says so. Body text 16px, labels at least 12px, contrast at least 4.5:1, 44px touch targets on phone, visible focus, `prefers-reduced-motion` respected.
- No secrets committed; `.env.example` committed, `.env` ignored.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Inputs and conditions the spec implies but does not spell out. Each has a test in the task named in brackets.

1. TMDB items with missing poster, backdrop, overview, release date or runtime must map to `null` and render with a fallback, never crash or show "undefined" [Task 3, Task 12].
2. TMDB timeout, 429 or 5xx must yield `502 TMDB_UNAVAILABLE` and an on-screen error with a Retry button, not a blank page [Task 3, Task 14, Task 16].
3. A favorite whose title no longer exists at TMDB must appear as `unavailable: true` and must not fail the whole favorites page [Task 9].
4. An admin acting on themselves, or demoting, blocking or deleting the last active admin, must get `409` (including "delete my account") [Task 8, Task 10].
5. Registering an email that already exists (different case, surrounding spaces, still unverified, already verified) must return the same `202`, create no duplicate, and never reveal which case applied [Task 6].
6. Also covered: `page` above 500 or below 1 and empty or over-long `q` return 400 [Task 4]; a reused revoked refresh token revokes the whole family [Task 7]; Redis down must not break catalog requests [Task 4].

---

## Phase 1: Backend

### Task 1: Repo, local infra and backend scaffold

**Files:**
- Create: `.gitignore`, `.nvmrc`, `docker-compose.yml`, `infra/postgres/init.sql`, `README.md`, `backend/` (via `nest new`), `backend/.env.example`, `backend/.env.test`, `backend/src/config/env.ts`, `backend/src/config/env.spec.ts`, `backend/src/app.setup.ts`, `backend/src/common/app.exception.ts`, `backend/src/common/all-exceptions.filter.ts`, `backend/src/common/paged.ts`, `backend/src/health/health.controller.ts`, `backend/test/health.e2e-spec.ts`
- Modify: `backend/src/main.ts`, `backend/src/app.module.ts`

**Interfaces:**
- Produces:
  - `loadEnv(raw: Record<string, string | undefined>): Env` in `config/env.ts`; throws an `Error` whose message lists every missing or invalid variable. `Env` has all variables from `docs/TRD.md` 3.6 with `featureDownloadButton: boolean` (from `FEATURE_DOWNLOAD_BUTTON`, default false) and `tmdbBaseUrl` defaulting to `https://api.themoviedb.org/3`. Injection token `ENV` (provider in a global `ConfigModule`).
  - `configureApp(app: INestApplication): void` in `app.setup.ts`: prefix `api/v1`, global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`, `AllExceptionsFilter`, helmet, cookie-parser, CORS for `WEB_ORIGIN` with credentials. Used by `main.ts` and every e2e test.
  - `class AppException extends HttpException` with `constructor(status: number, code: string, message: string)`; the filter outputs `{statusCode, code, message}` (non-`AppException` errors get code `ERROR`; validation errors get `VALIDATION_ERROR`).
  - `paged<T>(items: T[], page: number, totalPages: number, totalItems: number): Paged<T>`.
  - `GET /api/v1/health` returns `{status:'ok'}`.

- [ ] **Step 1:** The git repo is already initialised on branch `main` with `origin` set to `https://github.com/mianfrigo/cinevault.git` and the docs committed (done during planning). Extend `.gitignore` as needed (node_modules, dist, `.env`, `.env.local`, generated Prisma client, coverage) and add `.nvmrc` with the active LTS major. Pushing is done only when the owner says so.
- [ ] **Step 2:** `docker-compose.yml` with services `postgres` (db `cinevault`, init script creates `cinevault_test`), `redis`, `mailpit` (SMTP 1025, UI and API 8025). Run `docker compose up -d` and check the three containers are healthy (`docker compose ps`).
- [ ] **Step 3:** Scaffold: `npx @nestjs/cli new backend --package-manager npm --skip-git`. Install runtime deps `@nestjs/config helmet cookie-parser class-validator class-transformer` and dev deps `@types/cookie-parser`.
- [ ] **Step 4: Write failing tests**
  - `env.spec.ts`: `loadEnv({})` throws and the message contains `DATABASE_URL`, `REDIS_URL`, `TMDB_READ_TOKEN`, `JWT_ACCESS_SECRET`; with all required set and no `FEATURE_DOWNLOAD_BUTTON`, `featureDownloadButton === false`; `'true'` gives `true`; `tmdbBaseUrl` defaults as above.
  - `health.e2e-spec.ts`: `GET /api/v1/health` is 200 `{status:'ok'}`; `GET /api/v1/nope` is 404 with body keys `statusCode, code, message`.
- [ ] **Step 5:** Run `cd backend && npx jest src/config` and `npm run test:e2e`; expected FAIL (modules missing).
- [ ] **Step 6:** Implement the Interfaces above. `loadEnv` is hand-written (no schema library). `.env.test` points at `cinevault_test`.
- [ ] **Step 7:** Re-run both; expected PASS.
- [ ] **Step 8: Commit** `feat(backend): scaffold NestJS app with env validation, health, error filter`.

### Task 2: Prisma schema and database access

**Files:**
- Create: `backend/prisma/schema.prisma`, `backend/prisma.config.ts`, `backend/src/prisma/prisma.module.ts`, `backend/src/prisma/prisma.service.ts`, `backend/test/helpers/db.ts`, `backend/test/schema.e2e-spec.ts`
- Modify: `backend/package.json` (scripts `db:migrate`, `db:deploy`, `pretest:e2e` that runs `prisma migrate deploy` against `.env.test`)

**Interfaces:**
- Consumes: `ENV` token (Task 1).
- Produces: `PrismaService extends PrismaClient` constructed with `new PrismaPg({connectionString: env.databaseUrl})`, global module; `resetDb(prisma: PrismaService): Promise<void>` in `test/helpers/db.ts` truncates `favorites, email_tokens, refresh_tokens, users` with `RESTART IDENTITY CASCADE`. Enum and model names exactly as in `docs/backend-schema.md` section 2.

- [ ] **Step 1:** Install `prisma @prisma/client @prisma/adapter-pg pg`. Copy the schema from `docs/backend-schema.md` section 2 into `prisma/schema.prisma`; `prisma.config.ts` reads `DATABASE_URL` for the datasource and migrations path (follow current Prisma 7 config docs, do not put `url` in the schema).
- [ ] **Step 2: Write failing test** `schema.e2e-spec.ts`:
  - `inserting the same (userId, mediaType, tmdbId) favorite twice throws a unique violation`
  - `deleting a user cascades to favorites, refresh_tokens and email_tokens` (create one of each, delete user, assert counts 0)
  - `users.email is unique` (second insert with same email rejects)
- [ ] **Step 3:** Run `npm run db:migrate -- --name init` (creates the first migration), then `npm run test:e2e -- schema`; expected FAIL until `PrismaService` exists, then PASS.
- [ ] **Step 4:** Implement `PrismaService` and `PrismaModule`; add `onModuleInit` connect and `enableShutdownHooks` handling.
- [ ] **Step 5:** Run `npm run test:e2e`; expected all PASS.
- [ ] **Step 6: Commit** `feat(backend): Prisma schema, migration and PrismaService`.

### Task 3: TMDB mapper and client

**Files:**
- Create: `backend/src/tmdb/tmdb.constants.ts`, `backend/src/tmdb/tmdb.types.ts` (shared DTO types from `docs/backend-schema.md`: `TitleSummary`, `TitleDetail`, `SeasonDetail`, `MediaTypeParam`), `backend/src/tmdb/tmdb.mapper.ts`, `backend/src/tmdb/tmdb.mapper.spec.ts`, `backend/src/tmdb/tmdb.client.ts`, `backend/src/tmdb/tmdb.client.spec.ts`, `backend/src/tmdb/tmdb.module.ts`
- Test fixtures: `backend/src/tmdb/__fixtures__/*.json` (small hand-written TMDB-shaped payloads, including one with every nullable field missing)

**Interfaces:**
- Produces:
  - `mapSummary(raw: TmdbListItem, fallbackType?: MediaTypeParam): TitleSummary | null`: returns `null` for raw items that are neither movie nor tv (e.g. `media_type: 'person'`). `title` from `title` or `name`; `year` from `release_date` or `first_air_date`; `rating` rounded to one decimal, `null` when `vote_count` is 0 or the value is missing.
  - `mapDetail(raw: TmdbDetail, type: MediaTypeParam): TitleDetail` (cast top 12, director from crew job `Director`, `trailerUrl` from the first YouTube `Trailer` video, similar up to 12, `seasonList` for tv excluding season 0).
  - `mapSeason(raw: TmdbSeason): SeasonDetail`.
  - Image constants: `IMG = {poster:'w342', posterLarge:'w500', backdrop:'w1280'}`; `imageUrl(path: string | null, size: string): string | null`.
  - `TmdbClient.get<T>(path: string, query?: Record<string, string | number>): Promise<T>`; injected via token class `TmdbClient`; always adds `language=en-US`; adds `include_adult=false` whenever `path` starts with `/trending`, `/discover`, `/search`, or contains `/popular`, `/top_rated`, `/now_playing`, `/on_the_air`.
  - Errors: 404 from TMDB throws `AppException(404,'NOT_FOUND', ...)`; 429, 5xx, timeout (5s) or network error after one retry throw `AppException(502,'TMDB_UNAVAILABLE', ...)`. The retry waits `Retry-After` seconds when present (max 2s).

- [ ] **Step 1: Write failing tests** (`tmdb.mapper.spec.ts`): `mapSummary maps a full movie`, `mapSummary returns nulls for missing poster, backdrop, overview, date and rating`, `mapSummary returns null for media_type person`, `mapSummary uses name and first_air_date for tv`, `mapDetail returns empty cast, null trailer and null director when credits and videos are empty`, `imageUrl returns null for null path`.
- [ ] **Step 2: Write failing tests** (`tmdb.client.spec.ts`, using a local `http.createServer` as `TMDB_BASE_URL`): `sends Bearer token, language=en-US`; `adds include_adult=false on /search/multi and never on /movie/603`; `maps 404 to NOT_FOUND`; `retries once on 429 then succeeds`; `throws TMDB_UNAVAILABLE after repeated 500`; `throws TMDB_UNAVAILABLE on timeout` (server never responds, client timeout lowered through a constructor option).
- [ ] **Step 2b:** Run `npx jest src/tmdb`; expected FAIL.
- [ ] **Step 3:** Implement mapper and client (Node 22 global `fetch` with `AbortSignal.timeout`).
- [ ] **Step 4:** Run `npx jest src/tmdb`; expected PASS.
- [ ] **Step 5: Commit** `feat(backend): TMDB mapper and client with retry and error mapping`.

### Task 4: Cache module and catalog endpoints

**Files:**
- Create: `backend/src/cache/app-cache.module.ts`, `backend/src/cache/cached.ts`, `backend/src/catalog/catalog.service.ts`, `backend/src/catalog/catalog.controller.ts`, `backend/src/catalog/catalog.dto.ts`, `backend/src/catalog/catalog.module.ts`, `backend/test/catalog.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `TmdbClient`, mappers (Task 3), `paged` (Task 1), `ENV`.
- Produces:
  - Global `AppCacheModule` registering `CacheModule` with `stores: [createKeyv(redisUrl) (error listener attached), in-memory fallback]` as in current Nest caching docs (TTL in milliseconds).
  - `cached<T>(cache: Cache, key: string, ttlMs: number, load: () => Promise<T>): Promise<T>`: get, else load and set; cache errors are caught and logged, never thrown.
  - `CatalogService`: `list(kind: 'trending'|'popular'|'top-rated'|'new', type: MediaTypeParam, page: number): Promise<Paged<TitleSummary>>`, `genres(type)`, `discover(type, genreId: number, page)`, `search(q: string, page): Promise<Paged<TitleSummary>>` (movies and series only), `detail(type, id: number): Promise<TitleDetail>`, `season(tvId: number, n: number): Promise<SeasonDetail>`, `summaries(refs: {mediaType: MediaTypeParam; tmdbId: number}[]): Promise<(TitleSummary | null)[]>` (`null` when TMDB says NOT_FOUND; uses the detail cache).
  - Endpoints exactly as in `docs/backend-schema.md` section 4 "Public". Query DTO: `type` is `movie` or `tv` (default `movie` for lists), `page` integer 1 to 500 (default 1), `q` trimmed string length 1 to 100. TMDB path mapping: trending `/trending/{type}/week`, popular `/{type}/popular`, top-rated `/{type}/top_rated`, new `/movie/now_playing` or `/tv/on_the_air`, discover `/discover/{type}?with_genres=`, search `/search/multi` filtered to movie and tv.

- [ ] **Step 1: Write failing e2e tests** (`catalog.e2e-spec.ts`, `TmdbClient` overridden with a fake that counts calls and serves fixtures; real Redis from compose):
  - `GET /catalog/trending?type=movie returns Paged<TitleSummary> with at most 20 items`
  - `second identical request does not call TmdbClient again` (call count stays 1)
  - `search?q= (empty) is 400 VALIDATION_ERROR`; `search with 101 chars is 400`; `page=0 and page=501 are 400`
  - `GET /catalog/movie/603 returns TitleDetail`; `unknown id returns 404 NOT_FOUND`
  - `TMDB_UNAVAILABLE from the client returns 502 with code TMDB_UNAVAILABLE`
  - `with an unreachable Redis URL the endpoint still returns 200` (build the app with `REDIS_URL` pointing at a closed port)
- [ ] **Step 2:** Run `npm run test:e2e -- catalog`; expected FAIL.
- [ ] **Step 3:** Implement. TTLs per Global Constraints; cache key `tmdb:<route>:<sorted query string>`.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5: Commit** `feat(backend): cached catalog endpoints`.

### Task 5: Mail module

**Files:**
- Create: `backend/src/mail/mail.service.ts`, `backend/src/mail/mail.module.ts`, `backend/src/mail/templates.ts`, `backend/src/mail/mail.service.spec.ts`

**Interfaces:**
- Consumes: `ENV` (`smtpUrl`, `mailFrom`, `webOrigin`).
- Produces: `MailService` with `sendVerifyEmail(to: string, name: string, token: string)`, `sendResetPassword(to, name, token)`, `sendChangeEmail(to, name, token)`, `sendAlreadyRegistered(to, name)`, each returning `Promise<void>`. Links: verify `${webOrigin}/verify-email?token=`, reset `${webOrigin}/reset-password?token=`, change-email uses the verify link. Plain-text and simple HTML bodies; subject lines `Verify your Cinevault email`, `Reset your Cinevault password`, `Confirm your new Cinevault email`, `You already have a Cinevault account`. Transport is an injectable `Transporter` (token `MAIL_TRANSPORT`), default `nodemailer.createTransport(env.smtpUrl)`.

- [ ] **Step 1: Write failing tests** with a stub transport recording messages: `sendVerifyEmail sends to the address with the verify link containing the token`, `sendResetPassword link points to /reset-password`, `emails never contain the word undefined`, `sendAlreadyRegistered contains no token or link to verify`.
- [ ] **Step 2:** Run `npx jest src/mail`; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(backend): mail service`.

### Task 6: Auth, part 1: register, verify, resend, login

**Files:**
- Create: `backend/src/auth/password.service.ts`, `backend/src/auth/tokens.service.ts`, `backend/src/auth/email-tokens.service.ts`, `backend/src/auth/sessions.service.ts`, `backend/src/auth/auth.service.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/auth/auth.dto.ts`, `backend/src/auth/auth.module.ts`, `backend/src/auth/tokens.service.spec.ts`, `backend/test/auth-register-login.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces (names are used by Tasks 7 to 10):
  - `PasswordService`: `hash(plain: string): Promise<string>`, `verify(hash: string, plain: string): Promise<boolean>` (argon2id).
  - `TokensService`: `signAccess(user: {id: string; role: Role}): Promise<string>` (10 min), `verifyAccess(token: string): Promise<{sub: string; role: Role}>`, `generateOpaque(): {token: string; hash: string}`, `hashOpaque(token: string): string` (sha256 hex).
  - `EmailTokensService`: `issue(userId: string, type: EmailTokenType, opts?: {newEmail?: string}): Promise<string>` (returns the raw token; invalidates earlier unused tokens of the same user and type), `consume(raw: string, types: EmailTokenType[]): Promise<EmailToken>` (throws `AppException(400,'TOKEN_INVALID'|'TOKEN_EXPIRED')`, marks used).
  - `SessionsService`: `create(userId: string): Promise<{raw: string; expiresAt: Date}>`, `rotate(raw: string): Promise<{userId: string; raw: string; expiresAt: Date}>` (Task 7), `revoke(raw: string): Promise<void>`, `revokeAll(userId: string): Promise<void>`.
  - `normalizeEmail(e: string): string` (trim, lowercase) in `auth/email.ts`.
  - Endpoints `POST /auth/register`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login` per `docs/backend-schema.md`. Login sets cookie `cv_refresh` via a helper `setRefreshCookie(res, raw, expiresAt, env)`.
  - Register rules: normalize email; if no user exists, create `PENDING` user and send verify mail; if a `PENDING` user exists, issue a fresh token and re-send verify mail without changing name or password; if an `ACTIVE` or `BLOCKED` user exists, send `sendAlreadyRegistered` only. All three return `202 {message: 'If the address can be used, we sent an email.'}`.
  - Verify rules: VERIFY_EMAIL sets `status=ACTIVE` and `emailVerifiedAt` (a `BLOCKED` user stays blocked); CHANGE_EMAIL sets the new email (re-checked for uniqueness; conflict returns `400 TOKEN_INVALID`).

- [ ] **Step 1: Write failing tests** `tokens.service.spec.ts`: `generateOpaque returns a token whose hashOpaque equals hash`, `signAccess then verifyAccess round-trips sub and role`, `verifyAccess rejects a token signed with another secret`.
- [ ] **Step 2: Write failing e2e** (`auth-register-login.e2e-spec.ts`, Mailpit not needed: override `MAIL_TRANSPORT` with a recorder):
  - `register creates a PENDING user and sends one verify email`
  - `register with the same email in other case or with spaces returns the same 202 and creates no second user`
  - `register again while PENDING sends a new verify email and keeps the original password hash`
  - `register with a verified email sends the already-registered email and no verify token`
  - `password shorter than 10 chars is 400`
  - `verify-email with the emailed token activates the user; reusing it is 400 TOKEN_INVALID; an expired token is 400 TOKEN_EXPIRED`
  - `login before verification is 403 EMAIL_NOT_VERIFIED`; `wrong password and unknown email both give 401 INVALID_CREDENTIALS`; `blocked user gets 403 ACCOUNT_BLOCKED`
  - `successful login returns accessToken and user without passwordHash and sets the cv_refresh cookie httpOnly with path /api/v1/auth`
- [ ] **Step 3:** Run `npm run test:e2e -- auth-register`; expected FAIL.
- [ ] **Step 4:** Implement. Install `argon2 @nestjs/jwt nodemailer`. Unknown-email login performs a dummy `verify` against a constant hash to equalize timing.
- [ ] **Step 5:** Run unit and e2e; expected PASS.
- [ ] **Step 6: Commit** `feat(backend): register, verify email, resend and login`.

### Task 7: Auth, part 2: refresh, logout, reset, guards, block list

**Files:**
- Create: `backend/src/auth/blocklist.service.ts`, `backend/src/auth/jwt-auth.guard.ts`, `backend/src/auth/roles.guard.ts`, `backend/src/auth/decorators.ts`, `backend/test/auth-session.e2e-spec.ts`
- Modify: `backend/src/auth/auth.service.ts`, `auth.controller.ts`, `sessions.service.ts`, `auth.dto.ts`

**Interfaces:**
- Consumes: Task 6 services.
- Produces:
  - `BlockListService`: `block(userId: string): Promise<void>` (cache key `blocked:<id>`, TTL 600_000 ms), `unblock(userId)`, `isBlocked(userId): Promise<boolean>`.
  - `JwtAuthGuard` (reads Bearer token, verifies, rejects with `401 UNAUTHORIZED` when invalid, or `403 ACCOUNT_BLOCKED` when `isBlocked`); sets `req.user = {id, role}`. Decorators `@CurrentUser(): {id: string; role: Role}`, `@Roles(...roles: Role[])` (guards are applied per controller with `@UseGuards`). `RolesGuard` returns `403 FORBIDDEN`.
  - Endpoints `POST /auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` per the contract. `refresh` requires header `Origin` equal to `WEB_ORIGIN` when an `Origin` header is present, else `403 FORBIDDEN`; checks the user is `ACTIVE`; rotates the cookie. Forgot password: always 202; only `ACTIVE` users get a `RESET_PASSWORD` email. Reset: sets new password hash, revokes all sessions, returns 204.
  - `SessionsService.rotate` throws `AppException(401,'REFRESH_INVALID')` for unknown, expired or revoked tokens; presenting a revoked token also calls `revokeAll(userId)`.

- [ ] **Step 1: Write failing e2e** (`auth-session.e2e-spec.ts`):
  - `refresh with a valid cookie returns a new accessToken and a different cookie value`
  - `reusing the previous (rotated) refresh cookie is 401 REFRESH_INVALID and revokes the new one too`
  - `logout revokes the token and clears the cookie; refresh afterwards is 401`
  - `refresh with a foreign Origin header is 403`
  - `forgot-password returns 202 for unknown and known emails and sends mail only for the known active user`
  - `reset-password with a valid token changes the password, old password no longer logs in, all refresh tokens are revoked`
  - `an access token of a user who was just blocked gets 403 ACCOUNT_BLOCKED on a guarded route` (call `BlockListService.block` directly)
  - `RolesGuard: USER on an ADMIN route is 403`
  - `missing or malformed Authorization header is 401`
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement (add a temporary guarded test controller in the test module for the guard tests). **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(backend): refresh rotation, logout, password reset, guards and block list`.

### Task 8: Me endpoints

**Files:**
- Create: `backend/src/users/users.service.ts`, `backend/src/users/me.controller.ts`, `backend/src/users/users.dto.ts`, `backend/src/users/users.module.ts`, `backend/test/me.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `CurrentUser`, `PasswordService`, `EmailTokensService`, `SessionsService`, `MailService`.
- Produces: `UsersService`: `getMe(id): Promise<UserDto>`, `updateName(id, name): Promise<UserDto>`, `changePassword(id, oldPassword, newPassword): Promise<void>`, `requestEmailChange(id, newEmail, password): Promise<void>`, `deleteAccount(id, password): Promise<void>`, `countActiveAdmins(): Promise<number>` (also used by Task 10). `toUserDto(u: User): UserDto` in `users/user.dto.ts` (strips `passwordHash`). Endpoints per contract: `GET /me`, `PATCH /me`, `POST /me/change-password`, `POST /me/change-email`, `DELETE /me`.
- Rules: wrong old password or password gives `400 OLD_PASSWORD_WRONG` or `400 PASSWORD_WRONG`; a successful password change revokes all of the user's refresh tokens (the refresh cookie is not sent to `/me` routes, so the current session cannot be singled out; the client logs out after success and the access token expires within 10 minutes); change-email always returns 202 and silently does nothing for an address already used by another user; deleting the last active admin is `409 LAST_ADMIN`.

- [ ] **Step 1: Write failing e2e:** `GET /me returns the user without passwordHash`; `PATCH /me trims name and rejects empty or over 80 chars`; `change-password with wrong old password is 400 OLD_PASSWORD_WRONG`; `change-password success lets login work with the new password only`; `change-email sends mail to the new address and the email changes only after verify-email`; `change-email to an existing address returns 202 and sends nothing`; `DELETE /me with the wrong password is 400`; `DELETE /me removes the user and their favorites`; `the only admin DELETE /me is 409 LAST_ADMIN`; `all /me routes without a token are 401`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(backend): account endpoints`.

### Task 9: Favorites

**Files:**
- Create: `backend/src/favorites/favorites.service.ts`, `backend/src/favorites/favorites.controller.ts`, `backend/src/favorites/favorites.dto.ts`, `backend/src/favorites/favorites.module.ts`, `backend/test/favorites.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `CatalogService.summaries` (Task 4), `JwtAuthGuard`.
- Produces: `FavoritesService`: `add(userId, type: MediaTypeParam, tmdbId: number): Promise<void>` (upsert, idempotent), `remove(userId, type, tmdbId): Promise<void>` (idempotent), `ids(userId): Promise<{mediaType: MediaTypeParam; tmdbId: number}[]>`, `list(userId, type: MediaTypeParam | undefined, page: number): Promise<Paged<TitleSummary & {addedAt: string; unavailable?: boolean}>>` (20 per page, newest first). Endpoints per contract. `type` and `tmdbId` path params validated (`tmdbId` positive integer).
- Rule: for a favorite whose summary is `null` (TMDB NOT_FOUND) return `{tmdbId, mediaType, title: 'Unavailable title', year: null, rating: null, posterUrl: null, backdropUrl: null, overview: null, addedAt, unavailable: true}`. If TMDB is down (502), the list endpoint returns 502 (not partial data).

- [ ] **Step 1: Write failing e2e** (fake `TmdbClient`): `PUT is idempotent (two calls, one row)`; `DELETE of a missing favorite is 204`; `list is newest first and filtered by type`; `list pagination returns 20 per page with totalItems`; `a favorite whose TMDB title 404s appears with unavailable true and the request is 200`; `list returns 502 TMDB_UNAVAILABLE when the fake client throws it`; `ids returns all pairs`; `users only see their own favorites`; `invalid type or tmdbId 0 is 400`; `no token is 401`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(backend): favorites`.

### Task 10: Admin users and overview

**Files:**
- Create: `backend/src/admin/admin.service.ts`, `backend/src/admin/admin.controller.ts`, `backend/src/admin/admin.dto.ts`, `backend/src/admin/admin.module.ts`, `backend/test/admin.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`, `UsersService.countActiveAdmins`, `BlockListService`, `SessionsService.revokeAll`.
- Produces: `AdminService`: `listUsers(q: string | undefined, page: number): Promise<Paged<UserDto>>`, `updateUser(actorId: string, id: string, patch: {role?: Role; status?: 'ACTIVE' | 'BLOCKED'}): Promise<UserDto>`, `deleteUser(actorId, id): Promise<void>`, `overview(): Promise<{totalUsers: number; newThisWeek: number; recentSignups: UserDto[]}>`. Endpoints per contract.
- Rules: `actorId === id` for patch or delete gives `409 SELF_ACTION`; demoting, blocking or deleting an `ACTIVE` admin when `countActiveAdmins() === 1` gives `409 LAST_ADMIN`; `status: 'BLOCKED'` revokes all sessions and calls `block`; `status: 'ACTIVE'` calls `unblock` and is only allowed from `BLOCKED` (a `PENDING` user cannot be force-activated: `400 VALIDATION_ERROR`); unknown id is `404 NOT_FOUND`; `q` matches name or email case-insensitively (`contains`, `mode: 'insensitive'`); `newThisWeek` counts users created in the last 7 days; `recentSignups` is the 5 newest.

- [ ] **Step 1: Write failing e2e:** `USER token on any admin route is 403, no token is 401`; `list is paginated 20 per page, newest first, and q filters by name and by email in any case`; `admin can promote a user to ADMIN and block then unblock a user`; `blocking revokes the target's refresh tokens and their next guarded request is 403 ACCOUNT_BLOCKED`; `unblocking restores access`; `self patch and self delete are 409 SELF_ACTION`; `demoting or blocking or deleting the only active admin is 409 LAST_ADMIN, but works when a second admin exists`; `delete removes the user and cascades`; `overview returns totalUsers, newThisWeek (a user created 8 days ago is not counted) and 5 recent signups`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(backend): admin users and overview`.

### Task 11: Throttling, config endpoint, admin seed

**Files:**
- Create: `backend/src/config/config.controller.ts`, `backend/prisma/seed.ts`, `backend/test/hardening.e2e-spec.ts`
- Modify: `backend/src/app.module.ts` (global `ThrottlerGuard`, limit 100 per 60s), `backend/src/auth/auth.controller.ts` (`@Throttle` 5 per 60s on login, register, forgot-password, resend-verification), `backend/package.json` (`prisma.seed` / `db:seed` script)

**Interfaces:**
- Produces: `GET /config` returns `{features:{downloadButton: env.featureDownloadButton}}`; throttler excluded in tests through an env override `THROTTLE_DISABLED=true` except in `hardening.e2e-spec.ts`; `seed.ts` upserts an `ACTIVE`, verified `ADMIN` from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (argon2id) and exits non-zero with a clear message when either is missing.

- [ ] **Step 1: Write failing e2e:** `GET /config returns downloadButton false by default and true when FEATURE_DOWNLOAD_BUTTON=true`; `the 6th login attempt within a minute from one IP is 429 with code RATE_LIMITED`; `health is not rate limited by the auth limit`; `seed creates one admin and running it twice leaves one row`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement (map throttler exceptions to code `RATE_LIMITED` in the filter). **Step 4:** Run the full backend suite `npm test && npm run test:e2e`; expected all PASS.
- [ ] **Step 5: Commit** `feat(backend): rate limits, public config, admin seed`.

---

## Phase 2: Frontend

Run the API locally (`docker compose up -d`, `cd backend && npm run db:deploy && npm run db:seed && npm run start:dev`) when verifying UI tasks by hand. Frontend tests stub the API; they never need the backend.

**Frontend rules for every task below** (from `docs/TRD.md` section 4):
- Use PrimeNG components wherever one exists (see the mapping in `docs/ux-design-brief.md` section 4); do not build buttons, inputs, selects, tables, dialogs, toasts, accordions, avatars or skeletons from scratch. Owner-approved exceptions, built from scratch with Tailwind and signals to match the design: the hero carousel (`cv-hero`) and the paginator (`cv-paginator`).
- Style with Tailwind utility classes in templates. No component `styles:` blocks or per-component CSS files unless Tailwind and PrimeNG tokens cannot express it; when that happens, add a one-line comment saying why.
- Colors, fonts, radii, easing and breakpoints come from the theme (`src/styles/theme.css` and the PrimeNG preset); never write a raw hex in a template.
- State: follow the decision matrix in `docs/TRD.md` section 4.2 (SignalStore for global and page-interaction state, resources for read-only fetches, plain signals for local UI state).

### Task 12: Scaffold, theme, shell and shared UI

**Files:**
- Create: `frontend/` (via `ng new frontend --ssr --style=css --routing`), `frontend/.postcssrc.json`, `frontend/src/styles/theme.css`, `frontend/src/app/theme/cinevault-preset.ts`, `frontend/proxy.conf.json` (`/api` to `http://localhost:3000`), `frontend/src/app/core/models.ts` (all DTO types from `docs/backend-schema.md`), `frontend/src/app/shell/nav.component.ts`, `frontend/src/app/shell/footer.component.ts`, `frontend/src/app/shared/rating.component.ts`, `frontend/src/app/shared/poster-card.component.ts`, `frontend/src/app/shared/state-block.component.ts`, specs for each
- Modify: `frontend/src/index.html` (`class="app-dark"` on `<html>`, Schibsted Grotesk and Hanken Grotesk via Google Fonts `<link>` with `preconnect`), `frontend/src/styles.css`, `frontend/src/app/app.config.ts`, `frontend/src/app/app.routes.ts`, `frontend/src/app/app.ts`

**Interfaces:**
- Produces:
  - Install `tailwindcss @tailwindcss/postcss postcss primeng @primeuix/themes tailwindcss-primeui primeicons` (use the PrimeNG major that supports the installed Angular major). `.postcssrc.json` registers `@tailwindcss/postcss`. `styles.css` contains, in order: `@import "tailwindcss";`, `@import "tailwindcss-primeui";`, `@import "primeicons/primeicons.css";`, `@import "./styles/theme.css";`.
  - `theme.css`: a Tailwind v4 `@theme` block that defines the tokens from `docs/ux-design-brief.md` section 3 with the exact values of the mockup `:root` (`--color-surface-0` to `--color-surface-4`, `--color-line`, `--color-line-soft`, `--color-line-strong`, `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--color-accent`, `--color-accent-hover`, `--color-accent-text`, `--color-on-accent`, `--color-focus`, `--color-ok`, `--color-warn`, `--color-danger`, `--color-danger-solid`, `--font-sans`, `--radius-sm|md|lg` = 4, 6, 8px, `--ease-out-expo` = `cubic-bezier(.16,1,.3,1)`, `--breakpoint-md` 768px, `--breakpoint-lg` 1024px, `--breakpoint-xl` 1200px), plus base rules in `@layer base` (page background `surface-1`, text `fg`, focus-visible ring `focus`, selection color, skip link, `prefers-reduced-motion` reduces transitions to opacity only).
  - `cinevault-preset.ts`: `export default definePreset(Aura, {...})` mapping the same values into PrimeNG: `semantic.primary` scale built around `#4C60C8` (500) with `#5A6ED3` for hover, dark color scheme surfaces 950 to 600 = `#0A0B0E`, `#0E1014`, `#14161B`, `#1A1D23`, `#22262D`, text colors `#ECEDF0`, `#A7ABB6`, `#8D92A0`, focus ring `#A9B5F6`, border radius 4/6/8, font family from `--font-sans`. `app.config.ts` registers `providePrimeNG({theme: {preset, options: {darkModeSelector: '.app-dark', cssLayer: {name: 'primeng', order: 'theme, base, primeng'}}}})`, `provideAnimationsAsync()`, and `provideClientHydration(withEventReplay())` as scaffolded.
  - `RatingComponent` (`cv-rating`, input `value: number | null`): renders `★ 8.6` with tabular numerals; renders nothing for `null`.
  - `PosterCardComponent` (`cv-poster-card`, input `title: TitleSummary`; content slot `[heart]`): link to `/title/:type/:id`; `<img>` with `alt="{title} ({year})"`, `loading="lazy"`, `aspect-[2/3]`; when `posterUrl` is `null` renders a neutral `bg-surface-3` tile with the title text; two text lines (title, year omitted when `null`).
  - `StateBlockComponent` (`cv-state`, inputs `kind: 'loading' | 'empty' | 'error'`, `message?: string`; output `retry`): `p-skeleton` blocks for loading, a sentence for empty, `p-message` plus a `p-button` "Retry" for error.
  - `NavComponent`: sticky 64px bar with logo, links (Home, TV Shows, Movies, New & Popular, My List), search (`p-iconfield` with `pInputText`, Enter navigates to `/search?q=`), and an outlet for the auth area filled in Task 13. `FooterComponent`: the TMDB attribution sentence verbatim plus links to `/terms` and `/privacy` (placeholder pages that say they are placeholders).
  - Routes from `docs/app-flow.md` section 1 registered as lazy placeholders; `**` goes to a NotFound component.

- [ ] **Step 1:** Scaffold, install the packages, wire Tailwind and PrimeNG as above. Confirm `npm start` serves the default page and `npm run build` succeeds with SSR. Open a page with one `p-button` and one Tailwind-styled `div`; confirm PrimeNG styles are not overridden by Tailwind's base layer (button keeps its padding and color).
- [ ] **Step 2: Write failing component tests:** `RatingComponent renders "★ 8.6" for 8.6 and nothing for null`; `PosterCardComponent shows the title text and no img when posterUrl is null`, `...links to /title/movie/603`, `...omits the year when year is null`; `StateBlockComponent in error state shows the message and emits retry when Retry is clicked`; `FooterComponent contains the exact TMDB attribution sentence`.
- [ ] **Step 3:** Run `npx ng test --watch=false`; expected FAIL.
- [ ] **Step 4:** Implement the components with Tailwind classes and PrimeNG components.
- [ ] **Step 5:** Run tests and `npm run build`; expected PASS. Compare nav, footer and a sample poster row to the mockup at 1440px and 390px; list any visible differences and fix them through preset tokens or theme variables before moving on.
- [ ] **Step 6: Commit** `feat(frontend): scaffold with Tailwind, PrimeNG theme, shell and shared UI`.

### Task 13: Core: API client, stores, interceptor, guards

**Files:**
- Create: `frontend/src/app/core/api/api-client.ts`, `frontend/src/app/core/auth/auth.store.ts`, `frontend/src/app/core/auth/auth.interceptor.ts`, `frontend/src/app/core/auth/guards.ts`, `frontend/src/app/core/config/config.service.ts`, `frontend/src/app/core/favorites/favorites.store.ts`, `frontend/src/app/core/catalog/catalog.service.ts`, matching `*.spec.ts` for the auth store, interceptor, guards and favorites store
- Modify: `frontend/src/app/app.config.ts`, `frontend/src/app/shell/nav.component.ts`
- Install: `@ngrx/signals @ngrx/operators`

**Interfaces:**
- Produces:
  - `ApiClient`: `get<T>(path: string, params?: Record<string, string | number | undefined>): Observable<T>`, `post<T>(path, body?)`, `put<T>(path, body?)`, `patch<T>(path, body?)`, `delete<T>(path, body?)`; base `/api/v1` in the browser, `API_INTERNAL_URL` + `/api/v1` on the server (token `API_BASE`).
  - `AuthStore = signalStore({providedIn: 'root'}, withState<{user: UserDto | null; accessToken: string | null; ready: boolean}>, withComputed(isLoggedIn, isAdmin), withMethods(...))` with methods `login(email: string, password: string): Promise<void>` (rejects with the API error body), `logout(): Promise<void>`, `refresh(): Promise<boolean>` (one shared in-flight promise), `restoreSession(): Promise<void>` (browser only; run once through `provideAppInitializer`; sets `ready` true when done or after 3s), `setUser(user: UserDto)`.
  - `authInterceptor: HttpInterceptorFn`: attaches `Authorization` for `/api/v1` requests when a token exists; on `401` from a non-auth route calls `AuthStore.refresh()` once then retries the request once; if refresh fails, clears the session and navigates to `/login?next=<current url>`. `/auth/*` requests use `withCredentials: true`.
  - Guards `authGuard`, `guestGuard`, `adminGuard` (`CanActivateFn`): they wait for `ready`, then decide: visitor on a guarded route goes to `/login?next=`; non-admin on an admin route goes to `/dashboard/favorites`; logged-in user on a guest route goes to `/dashboard/favorites`.
  - `FavoritesStore = signalStore({providedIn: 'root'}, withState<{keys: string[]}>, withComputed(keySet), withMethods(...))`; keys look like `movie:603`; methods `isFavorite(type: MediaTypeParam, id: number): boolean`, `load(): Promise<void>` (from `GET /me/favorites/ids`), `toggle(type, id): Promise<void>` (optimistic, rolls back and rethrows on API error; for visitors navigates to `/login?next=<current url>` and does not call the API), `clear()`. An `effect` in the store loads on login and clears on logout.
  - `ConfigService`: `features: Signal<{downloadButton: boolean}>`, loaded once from `GET /config`, default `false` on failure (a plain service with a signal, no store).
  - `CatalogService`: `list(kind, type, page)`, `genres(type)`, `discover(type, genre, page)`, `search(q, page)`, `detail(type, id)`, `season(tvId, n)` returning Observables of the DTOs.
  - Nav auth area: Log in and Register buttons (`p-button`) for visitors; for users a `p-avatar` with a `p-menu` popup (Favorites, Account, Admin if `isAdmin`, Log out).

- [ ] **Step 1: Write failing tests:**
  - `AuthStore.refresh called twice at once makes one HTTP request`
  - `AuthStore.isAdmin is true only for role ADMIN`
  - `interceptor: a 401 triggers one refresh then retries the original request once`
  - `interceptor: failed refresh clears the user and navigates to /login with next`
  - `authGuard redirects a visitor to /login?next=/dashboard/favorites`; `adminGuard redirects a USER to /dashboard/favorites`; `guestGuard redirects a logged-in user`
  - `FavoritesStore.toggle adds the key optimistically and removes it when the API fails`; `toggle as a visitor navigates to /login and makes no API call`
  - `ConfigService defaults downloadButton to false when the request fails`
- [ ] **Step 2:** Run `npx ng test --watch=false`; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5: Commit** `feat(frontend): API client, auth and favorites stores, interceptor and guards`.

### Task 14: Home

**Files:**
- Create: `frontend/src/app/features/home/home.page.ts`, `frontend/src/app/features/home/hero.component.ts`, `frontend/src/app/shared/poster-row.component.ts`, specs
- Modify: `frontend/src/app/shared/poster-card.component.ts` (heart button in the `[heart]` slot), `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `CatalogService`, `FavoritesStore`, shared components.
- Produces:
  - `HeroComponent` (`cv-hero`, input `items: TitleSummary[]`): built from scratch (owner decision) with Tailwind and signals: stacked slides cross-fading with opacity and a small `transform` settle, current index in a signal, wrap-around, `aria-roledescription="carousel"` with each slide labelled "n of N", left and right arrow keys when focused, pointer swipe on touch. Content per `docs/ux-design-brief.md` section 4 (left column max 560px; `★ rating · year · type`; 2-line clamp synopsis; Details `p-button` linking to the title; My List toggle). Thin progress bars (one per slide, the active one fills over 7s) driven by the current index, arrows and a pause button. Autoplay stops on hover, focus, pause and when `prefers-reduced-motion` matches. The first slide image has `fetchpriority="high"`. Items without `backdropUrl` are skipped; with none left the hero is omitted.
  - `PosterRowComponent` (`cv-poster-row`, inputs `heading: string`, `items: TitleSummary[]`, `seeAllLink?: string[]`): `p-carousel` with responsive `numVisible` for poster widths per the UX brief, `showIndicators=false`, arrows visible on row hover or focus.
  - `HomePage`: loads in parallel with `rxResource` (read-only fetches): trending movies (hero uses the first 3 with a backdrop, plus a row), new TV, top-rated movies, movie genres for tiles (Tailwind grid of links to `/genre/movie/:id`, tonal fields, no art). Each section has its own `cv-state` loading and error with Retry (`resource.reload()`); one failing request does not blank the page.
  - Poster heart: `p-button` (text, rounded icon `pi pi-heart` or `pi pi-heart-fill`) calling `FavoritesStore.toggle`; shown on hover and focus, always visible under `@media (hover: none)`.

- [ ] **Step 1: Write failing tests:** `Hero shows the first item and the next control advances`; `Hero does not autoplay when prefers-reduced-motion matches`; `Hero omits items without backdropUrl and renders nothing when none have one`; `Home renders three rows when all requests succeed`; `Home shows an error block with Retry in one row when that request fails and still renders the others`; `PosterCard heart calls FavoritesStore.toggle("movie", id)`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS.
- [ ] **Step 5:** Compare to the mockup Home at 1440 and 390 wide. If `p-carousel` cannot reach the mockup's row behavior (horizontal scroll with edge fade), replace `PosterRowComponent`'s internals with a Tailwind scroll-snap container and record the reason in a code comment; the hero stays custom.
- [ ] **Step 6: Commit** `feat(frontend): home page`.

### Task 15: Browse and search

**Files:**
- Create: `frontend/src/app/features/browse/browse.page.ts`, `frontend/src/app/features/browse/search.page.ts`, `frontend/src/app/features/browse/poster-grid.component.ts`, `frontend/src/app/shared/paginator.component.ts`, specs
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Produces: `PaginatorComponent` (`cv-paginator`, built from scratch with Tailwind by owner decision; inputs `page: number` (1-based), `totalPages: number`; output `pageChange: number`): a `nav` with `aria-label="Pagination"`, Prev and Next buttons, up to 5 numbered buttons around the current page with ellipses and the first and last page, 44px touch targets, styled with the theme tokens; reused by Tasks 18 and 19. Routes `/movies`, `/tv` (popular grid with genre links), `/new` (two sections, movies and tv), `/genre/:type/:id`, `/search?q=`. `PosterGridComponent` (`cv-poster-grid`, inputs `items: TitleSummary[]`, `page: number`, `totalPages: number`; output `pageChange`): Tailwind grid of `cv-poster-card` with `cv-paginator` (`totalPages` capped at 500 by the caller); the page lives in the `?page=` query param so URLs are shareable and server-renderable. Data via `rxResource` keyed on route params and the `page` and `q` query params. Search: empty `q` shows a prompt state and makes no request; no results shows an empty state containing the query. The nav search submits to `/search?q=`.

- [ ] **Step 1: Write failing tests:** `Paginator renders Prev, numbered buttons with ellipses and Next; the current page has aria-current="page"`; `Paginator disables Prev on page 1 and Next on the last page`; `Paginator emits pageChange with the clicked page number`; `Paginator renders nothing when totalPages is 1 or less`; `PosterGrid emits pageChange with the new page when the paginator changes`; `Search page with no results shows the empty state containing the query`; `Search page with q missing shows the prompt state and makes no request`; `Genre page reads type and id from the route and calls discover`; `Browse /movies uses the page query param`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS. **Step 5: Commit** `feat(frontend): browse, genre and search pages`.

### Task 16: Title detail page

**Files:**
- Create: `frontend/src/app/features/title/title.page.ts`, `frontend/src/app/features/title/seasons.component.ts`, specs
- Modify: `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `CatalogService`, `FavoritesStore`, `ConfigService`, `PosterRowComponent`.
- Produces: `/title/:type/:id` using `rxResource` keyed on route params: backdrop and poster, title with year, `★ rating · runtime or "N seasons" · genres (links to genre pages) · type`, Watch trailer (`p-button` link to `trailerUrl`, hidden when `null`), Add to My List toggle (`p-button`), Download (`p-button` dashed outline with a muted "Hidden in production" caption, rendered only when `ConfigService.features().downloadButton` is true; click shows a `p-toast` message "Download is coming soon" and makes no request), overview ("No overview available." when `null`), top cast as a name and character list with `p-avatar` initials in neutral tones, facts list, seasons as `p-accordion` (`SeasonsComponent`: episodes load when a panel first opens), More like this row. Unknown id shows the Not found state; `TMDB_UNAVAILABLE` shows an error block with Retry. `MessageService` and `p-toast` are provided once in the app shell and reused everywhere.

- [ ] **Step 1: Write failing tests:** `Download button is not rendered when the flag is false and is rendered when true`; `clicking Download shows the coming-soon toast and makes no HTTP request`; `Title page for a movie with null runtime, overview and trailer renders without "undefined" or "null" text`; `Seasons accordion requests season 2 only when its panel is opened`; `Title page shows the Not found state for a 404`; `Title page shows an error with Retry on 502`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS. **Step 5:** Compare to the mockup (movie and series) at 1440 and 390. **Step 6: Commit** `feat(frontend): title detail page`.

### Task 17: Auth pages

**Files:**
- Create: `frontend/src/app/features/auth/{login,register,forgot-password,reset-password,verify-email,check-email}.page.ts`, `frontend/src/app/features/auth/auth-card.component.ts`, specs
- Modify: `frontend/src/app/app.routes.ts` (`guestGuard` on login, register, forgot-password)

**Interfaces:**
- Produces: pages per `docs/app-flow.md`. Reactive forms with PrimeNG fields (`pInputText`, `p-password`, `p-floatlabel` or visible labels, `p-message` for inline errors, `p-button` for submit with `loading`); errors are text, never color alone. Register: name (1 to 80), email, password (min 10, max 128) with confirm; success navigates to `/check-email?email=`. Login: `INVALID_CREDENTIALS` becomes "Email or password is incorrect.", `EMAIL_NOT_VERIFIED` becomes a message with a Resend link (`POST /auth/resend-verification`), `ACCOUNT_BLOCKED` becomes "This account has been blocked."; success goes to the `next` param (same-origin paths only) or `/dashboard/favorites`. Verify-email reads `token` and shows success (link to Login), or expired and invalid states with Resend. Forgot password always shows "If that email exists, we sent a link." Reset validates new password and confirm, then goes to Login with a notice. Check-email offers Resend with a 30s countdown. `AuthCardComponent` is the shared layout (card with the logo) built from `p-card`.

- [ ] **Step 1: Write failing tests:** `Register blocks submit and shows errors for a 9-char password and a mismatched confirm`; `Register success navigates to /check-email`; `Login maps EMAIL_NOT_VERIFIED to the resend message and ACCOUNT_BLOCKED to the blocked message`; `Login ignores a next param that is an absolute external URL`; `Verify page calls /auth/verify-email once with the token and shows success`; `Forgot password shows the neutral message for both 202 responses`; `Reset page shows the expired state for TOKEN_EXPIRED`; `Check-email Resend button is disabled during the 30s countdown`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS. **Step 5:** Compare to the mockup auth screens. **Step 6: Commit** `feat(frontend): auth pages`.

### Task 18: Dashboard: favorites and account

**Files:**
- Create: `frontend/src/app/features/dashboard/dashboard-shell.component.ts` (Tailwind sidebar from 1024px, bottom tab bar below), `frontend/src/app/features/dashboard/favorites.page.ts`, `frontend/src/app/features/dashboard/favorites-page.store.ts`, `frontend/src/app/features/dashboard/account.page.ts`, specs
- Modify: `frontend/src/app/app.routes.ts` (`authGuard` on `/dashboard/**`)

**Interfaces:**
- Consumes: `ApiClient`, `AuthStore`, `FavoritesStore`.
- Produces:
  - `FavoritesPageStore = signalStore(withState<{type: 'all' | MediaTypeParam; page: number; items: FavoriteItem[]; total: number; status: 'idle' | 'loading' | 'error'; pendingRemoval: {key: string; item: FavoriteItem} | null}>, withMethods(...))`, provided in the page component's `providers` (component-level). Methods: `setType(type)`, `setPage(page)` (both reload through `rxMethod`), `remove(item)` (hides the item and starts a 5s timer; the DELETE is sent when the timer ends or another removal starts), `undo()` (restores the item, no request), `reload()`.
  - Favorites page: `p-selectbutton` filter All, Movies, Series (query param `?type=`), grid of `cv-poster-card` with a remove button, `cv-paginator`, `p-toast` message with an Undo action for 5s, `unavailable` items show the "Unavailable title" label with a Remove action, empty state "You have not saved anything yet." with a link to Home.
  - Account page: sections Profile (name), Change password (old, new, confirm; on success logs out and navigates to `/login` with a "Password changed, please log in again" notice), Change email (new email, current password, notice that a verification email goes to the new address), Delete account (`p-dialog`: type `DELETE` and enter password; destructive `p-button` enabled only when both are valid; success logs out and goes to `/`).

- [ ] **Step 1: Write failing tests:** `FavoritesPageStore.setType('tv') requests type=tv and page 1`; `remove then undo sends no DELETE`; `remove then waiting 5s sends DELETE once`; `a second remove sends the first DELETE immediately`; `unavailable favorite shows the Unavailable title label`; `Favorites empty state links to Home`; `Account change password shows OLD_PASSWORD_WRONG inline`; `Account change password success logs the user out and navigates to /login`; `Account delete is disabled until DELETE is typed and a password is entered`; `Account delete success calls logout and navigates to /`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS. **Step 5:** Compare to the mockup. **Step 6: Commit** `feat(frontend): dashboard favorites and account`.

### Task 19: Admin pages

**Files:**
- Create: `frontend/src/app/features/admin/users.page.ts`, `frontend/src/app/features/admin/users-page.store.ts`, `frontend/src/app/features/admin/overview.page.ts`, specs
- Modify: `frontend/src/app/app.routes.ts` (`authGuard` + `adminGuard` on `/admin/**`), `frontend/src/app/features/dashboard/dashboard-shell.component.ts` (Users and Overview items for admins)

**Interfaces:**
- Consumes: `ApiClient`, `AuthStore`.
- Produces:
  - `UsersPageStore = signalStore(withState<{query: string; page: number; items: UserDto[]; total: number; status: 'idle' | 'loading' | 'error'; busyIds: string[]}>, withMethods(...))`, component-level. `setQuery(q)` uses `rxMethod` with `debounceTime(300)`, `distinctUntilChanged`, `switchMap`; `setPage(page)`; `changeRole(id, role)`, `setStatus(id, status)`, `remove(id)` each patch the row on success and return the API error code on failure.
  - Users page: `p-iconfield` search, `p-table` (lazy, 20 rows) with `cv-paginator` that collapses to stacked rows below 768px (PrimeNG's responsive table option if it renders acceptably, otherwise a Tailwind `hidden md:table` plus card list), `p-select` for role, `p-button` Block or Unblock, delete through `p-confirmpopup`, status as a dot plus text. The signed-in admin's row has role, block and delete controls disabled with an explanatory `title`. `LAST_ADMIN` and `SELF_ACTION` errors show a plain `p-toast` message and leave the row unchanged.
  - Overview page: two figures (total users, new this week), a recent sign-ups list, error state with Retry; data via `rxResource`.

- [ ] **Step 1: Write failing tests:** `UsersPageStore.setQuery waits 300ms and requests ?q=`; `changing a role calls PATCH with {role}`; `blocking calls PATCH with {status:'BLOCKED'} and the row shows Blocked`; `a LAST_ADMIN error leaves the row unchanged and shows the message`; `own row controls are disabled`; `delete needs the confirm step before DELETE is sent`; `Overview renders both numbers and the recent sign-ups`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement. **Step 4:** Expected PASS. **Step 5:** Compare to the mockup admin screens. **Step 6: Commit** `feat(frontend): admin users and overview`.

### Task 20: SSR, SEO, end-to-end smoke and launch checklist

**Files:**
- Create: `frontend/src/app/core/seo/seo.service.ts` and spec, `frontend/public/robots.txt`, `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/stub-tmdb.mjs`, `docs/launch-checklist.md`
- Modify: `frontend/src/app/features/title/title.page.ts`, `frontend/src/app/features/home/home.page.ts`, `frontend/src/server.ts` (catalog routes send `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`; every other route `no-store`), `README.md`

**Interfaces:**
- Produces: `SeoService.set({title: string; description?: string; image?: string | null; path: string}): void` (sets `<title>`, description, canonical, `og:title`, `og:description`, `og:image`, `og:type`); title pages use `"{title} ({year}) | Cinevault"`. `robots.txt` allows public routes and disallows `/dashboard`, `/admin`, `/api`. Smoke spec: register through the UI, read the verification link from Mailpit's HTTP API (`http://localhost:8025/api/v1/messages`), verify, log in, open a title, add it to My List, see it on Favorites, log out; then as the seeded admin block that user and confirm the user's next API call is rejected. `stub-tmdb.mjs` serves fixture JSON on a local port used as `TMDB_BASE_URL`. `docs/launch-checklist.md` lists the release criteria from `docs/PRD.md` section 9 as checkboxes.

- [ ] **Step 1: Write failing tests:** `SeoService.set writes title, description, canonical and og:image tags` and `...omits og:image when image is null`.
- [ ] **Step 2:** Run; expected FAIL. **Step 3:** Implement the service and use it on Home and Title.
- [ ] **Step 4:** Build and serve SSR (`npm run build && npm run serve:ssr:frontend`); with `curl` verify `/title/movie/603` returns HTML with the title in `<title>` and the overview in the body without running JavaScript, that PrimeNG styles are present in the server HTML (no unstyled flash), and that `/dashboard/favorites` contains no user data.
- [ ] **Step 5:** Write the Playwright smoke spec and stub; run `cd e2e && npx playwright test`; expected PASS with the full local stack (compose, API with `TMDB_BASE_URL` at the stub and `THROTTLE_DISABLED=true`, SSR server).
- [ ] **Step 6:** Run Lighthouse (mobile) on `/` and `/title/movie/603` against the production build with the stub; record LCP and CLS in `docs/launch-checklist.md`; fix regressions above the PRD targets (LCP under 2.5s, CLS under 0.1) or note them as open items. Check the production CSS size; the Tailwind output plus PrimeNG should stay within a reasonable budget (record the number).
- [ ] **Step 7:** Run everything: `cd backend && npm test && npm run test:e2e`, `cd ../frontend && npx ng test --watch=false && npm run build`; expected all PASS.
- [ ] **Step 8: Commit** `feat: SEO, SSR caching headers, e2e smoke and launch checklist`.

---

## Out of this plan (decided elsewhere)

Hosting and CI provider (TRD section 8 and 9), real Terms and Privacy text, email provider account and sending domain, TMDB commercial-license answer, legal review of the Download feature. The launch checklist tracks them.
