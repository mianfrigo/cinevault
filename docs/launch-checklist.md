# Cinevault v1 launch checklist

Status as of Task 20B (2026-11-13). A box is checked only when the repository, a test or a recorded run proves it; everything else is open with an owner and a next step. Owners: **you** (the project owner/developer), **ops** (whoever deploys and runs it), **legal**, **product** (decisions).

## 1. Release criteria (docs/PRD.md section 9)

- [ ] **1. All features in section 5 work on phone (390px) and laptop (1440px) widths.**
  - Evidence so far: Chrome checks at 390 and 1440 were done per task (see each `task-*-report.md`), and the smoke runs a desktop viewport (1280x720) only. Nothing automated covers 390px. Owner: you. Next: one manual pass of every screen at 390 and 1440, or add a 390px Playwright project to `e2e/playwright.config.ts`.
- [x] **2a. Backend tests and frontend tests pass.** Backend 80 unit + 185 e2e, frontend 539 (see Results). Commands: `cd backend && npm test && npm run test:e2e`, `cd frontend && npx ng test --watch=false`.
- [x] **2b. The end-to-end smoke passes against the local stack.** `cd e2e && npm test`: 5 tests pass, twice back to back (see Results). Covers register, Mailpit verification, login, title, My List, Favorites, logout, admin block with the next call refused, 404 and 503 statuses, response headers.
- [ ] **3. The `downloadButton` flag is off in production config.**
  - Evidence so far: the code default is off (`FEATURE_DOWNLOAD_BUTTON` defaults to `false` in `backend/src/config/env.ts`, `.env.example` says `false`, the e2e stack sets `false`, and the Download button is absent in the smoke). There is no production config yet (hosting is undecided). Owner: ops. Next: leave `FEATURE_DOWNLOAD_BUTTON` unset or `false` in the production environment and re-check `GET /api/v1/config` returns `downloadButton: false` after the first deploy.
- [ ] **4. TMDB license question answered by the owner.** Launch blocker (PRD section 8). Owner: product. Next: ask TMDB whether a commercial license is needed for a product of this kind; record the answer here.
- [x] **5a. TMDB attribution visible.** "This product uses the TMDB API but is not endorsed or certified by TMDB." is in the footer (`footer.component.ts`, `cv-tmdb-credit`); the smoke asserts it on Home (`user journey`).
- [ ] **5b. Terms and Privacy pages have owner-supplied text.** `/terms` and `/privacy` render a placeholder ("Placeholder page. The owner will supply the final text."). Owner: legal/product. Next: supply the text; it then replaces `pages/placeholder.component.ts` for those two routes.
- [x] **6a. First admin created by the seed script.** `npm run db:seed` creates or promotes the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; the smoke seeds a fresh database and the admin logs in through the UI and blocks a user (`admin blocks the user`). Seed behaviour is also covered in `backend/test/hardening.e2e-spec.ts`.
- [ ] **6b. Seed credentials rotated.** Owner: ops. Next: seed with a strong one-off password, log in, change the password from Account, and delete the credentials from the deploy environment. The seed never resets the password of an already verified admin, so a re-run is safe.

## 2. Open items carried from the build

Collected from the SDD ledger, the PR descriptions (#2 to #29), the security audit (`security-audit-skill/cinevault/run-1`: `REPORT.md`, `NEEDS-VALIDATION.md`, `hardening-notes.md`) and Task 20B itself. P1 = before the public launch, P2 = soon after, P3 = when convenient.

### 2.1 Ops: deployment facts (P1 unless noted)

- [ ] **Hosting** is undecided (TRD section 8): Node runtime for the API and the SSR server, managed PostgreSQL, managed Redis, HTTPS, one domain.
- [ ] **A reverse proxy in front of both servers is required.** The browser calls `location.origin + /api/v1`; the SSR server (`frontend/src/server.ts`) does not proxy `/api`, so the proxy must send `/api/**` to the API and everything else to the SSR server on one origin. The e2e uses `e2e/proxy.mjs` for exactly this. The same proxy must also: compress text (brotli/gzip: neither server compresses; Lighthouse numbers below assume it), add `Strict-Transport-Security` (only the API sends HSTS; the SSR responses have none), pass `Host` through, and honour `Cache-Control` (`s-maxage` on catalog pages, `immutable` on hashed assets) if it is a CDN.
- [ ] **Environment, API:** `NODE_ENV=production`; `JWT_ACCESS_SECRET` at least 32 random characters (enforced) with a rotation plan (rotating signs everyone out within 10 minutes); `WEB_ORIGIN` = the public origin (CORS and the refresh Origin check); `COOKIE_SECURE` stays `true` (the production default); `TRUST_PROXY=1` (never `true`: the whole `X-Forwarded-For` chain would be trusted and rate limits could be dodged); `THROTTLE_DISABLED` unset (refused in production); `FEATURE_DOWNLOAD_BUTTON=false`; a real `TMDB_READ_TOKEN`; `DATABASE_URL`, `REDIS_URL`, `SMTP_URL`, `MAIL_FROM`.
- [ ] **Environment, SSR server:** `NODE_ENV=production`; `NG_ALLOWED_HOSTS` (required, comma-separated host names; unset means every request is a 400); `SITE_URL` (`https://...`, the canonical/`og:url` origin); `API_INTERNAL_URL` (default is `http://localhost:3000`, wrong anywhere else); `PORT`; `PRIMENG_LICENSE_KEY`.
- [ ] **PrimeNG license key** in the deployment environment (or `frontend/.env`), then verify in a browser that the red "Invalid PrimeUI License" badge and the console warning are gone. The key reaches the browser by design (transfer state). The e2e and Lighthouse runs use no key, so the badge is present there.
- [ ] **TLS-terminating proxy and the SSR origin:** behind TLS the request origin reads `http:`. `SITE_URL` fixes canonical links, but the HTTP transfer cache maps the internal API origin to the request origin: set `NG_TRUST_PROXY_HEADERS=x-forwarded-host,x-forwarded-proto` (only headers the proxy overwrites, never ones a client can send) and check in devtools that no `/api/v1/catalog/*` GET repeats in the browser after load (frontend README, SSR HTTP transfer cache).
- [ ] **Throttle counters are per process** (in-memory). More than one API instance means separate budgets: move the throttler to Redis storage. Also keep an upstream per-IP limit on `/api/v1/me/*` and the auth routes (see 2.3). Redis: check `maxmemory-policy` (the block list marker shares the evictable cache with the catalog, see 2.3).
- [ ] **TLS to the data stores and the mail relay.** `SMTP_URL` has a dev default `smtp://localhost:1025` and no production TLS check: use `smtps://` or a `requireTLS` query parameter (audit lead, P1). Use TLS for `DATABASE_URL` (`sslmode=require`) and `REDIS_URL` (`rediss://`).
- [ ] **TMDB egress:** `TMDB_BASE_URL` accepts any parseable URL and the client follows redirects with the bearer token. In production require `https` and the TMDB host, and fetch with `redirect: 'manual'` (audit hardening note, P2).
- [ ] **Email provider** account and verified sending domain (SPF, DKIM, DMARC); `MAIL_FROM` on that domain; per-recipient and per-account send limits on the provider side (the API has none, see 2.3).
- [ ] **Backups and retention.** PostgreSQL backups and a restore test. `refresh_tokens` and `email_tokens` rows (expired, revoked, used) and never-verified PENDING users are never purged: add a periodic delete and an index on `(userId, revokedAt)` (audit hardening note, P2).
- [ ] **Deploy mechanics:** `prisma migrate deploy` as a deploy step; `npm ci --omit=dev` fails at `postinstall` (`prisma generate`, prisma is a devDependency): build in a stage with dev dependencies; the seed needs `tsx` and `prisma` (devDependencies) at deploy time; `backend/src/main.ts` loads `backend/.env` also under `start:prod`, so no stray `.env` may exist in the image; flush the Redis cache on deploys that change a DTO shape (cache keys are not versioned); build `dist` from a clean checkout.
- [ ] **Pin the Mailpit image** (`axllent/mailpit:latest` in `docker-compose.yml`) to a version (P3, dev tooling; the e2e depends on its HTTP API).
- [ ] **GitHub:** branch protection requires `CI OK`; enable secret scanning and push protection; keep the `npm audit` gate.
- [ ] **Content-Security-Policy** (P2). Only `frame-ancestors 'none'` is set. A full policy needs nonces for Angular SSR inline scripts and styles, PrimeNG's runtime styles, Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) and `image.tmdb.org`, and a pass in Chrome with devtools open.
- [ ] **Sitemap and `/search` noindex** (P3): not done; `robots.txt` lists the private routes.
- [ ] **PrimeNG license terms** (P1, with the key above): read PrimeNG's `LICENSE.md` for this product and update the TRD's open-source assumption accordingly (the key is in the Community tier for individuals; a company or commercial use may need a paid license).
- [ ] **Audit hardening for the deploy** (P3): consider the `__Host-` prefix for the refresh cookie once TLS is confirmed; Prisma engine download mirror and egress policy (`PRISMA_ENGINES_MIRROR`); `backend/scripts/migrate-test.js` runs an unpinned `npx` with `shell:true` and its `_test` guard checks only the database name, not the host.

### 2.2 Legal and product decisions (P1 unless noted)

- [ ] **TMDB commercial-license answer** (blocker, criterion 4).
- [ ] **Download button legal review** (PRD section 7: off in production until the owner records a sign-off). The button, its hydration with the flag on, and the "coming soon" toast are tested; the feature behind it is not built.
- [ ] **Terms and Privacy text** (criterion 5b), including what the product stores (email, password hash, favorites) and the cookie.
- [ ] **P2** **Pre-registration takeover, residual** (Task 6 decision, audit LOW finding). Re-registering a PENDING address overwrites the name and password, so anyone who knows an unverified address can set the password the victim's next verification click will activate. Options: require the password at verify time, or bind the password hash to the verification token. Owner decision.
- [ ] **Adult content on detail pages** (audit lead; PRD section 7 says `include_adult=false` on every TMDB call, TRD only lists list, search and discover). Detail, season, similar and favorites pages by id have no adult gate. Check with your own TMDB token whether `/movie/{id}` and `/tv/{id}` return `adult: true` titles and decide whether to filter in the mapper.
- [ ] **P2** **Account policies not implemented:** per-account login throttle or lockout (only per-IP limits and argon2 cost); absolute refresh-token session cap (tokens slide for 30 days on every rotation; consider a 90 day cap); the old address is not notified when an email change completes; no revoke of other sessions on email change.

### 2.3 You: engineering follow-ups (tagged P1, P2 or P3 each)

Performance (Task 20B Lighthouse, see Results):

- [ ] **P2, owner decision needed: the LCP on Lighthouse's default Slow 4G is at the 2.5 s target, not clearly under it.** Median of 3 on Slow 4G (1.6 Mbps / 150 ms RTT): `/` 2.42 s (runs 2.42 to 3.05, the first run of a batch is the slow one), title page 2.50 s (2.499 to 2.503: a coin flip on the threshold). On the 9 Mbps / 170 ms "4G" profile (the literal PRD wording) both pass at 1.72 s. What moved it (from 3.62 s and 3.32 s): the PrimeIcons font cut to the 22 icons in use (32 KB to 2 KB; the build had preloaded it), the Aura theme cut to the components the app imports (about 70 KB raw off the initial JS), Angular Forms out of the initial bundle (the nav search is a deferred, lazily hydrated block), and hero and title backdrops with a 780 px and a 1280 px `srcset` (a phone no longer downloads the 1280 px picture; with real TMDB files that is roughly half the bytes, the lab stand-ins understate it). Left on the table: the two Google Fonts variable families (one render-blocking CSS request plus about 46 KB of woff2 on a third-party origin; self-hosting them also removes the IP disclosure to Google, a privacy-policy point), `@primeui/license-manager` (about 21 KB raw) and the rest of PrimeNG's base. Choose: accept this as met (the lab is simulated and the unthrottled LCP is about 0.3 s), or self-host and subset the fonts to clear the threshold with margin.
- [ ] **P3** **A visitor without a session logs a console error on every page load**: the first `POST /api/v1/auth/refresh` answers 401 (Lighthouse Best Practices 96 instead of 100, "errors in console"). A non-401 "no session" answer or a non-HttpOnly marker cookie would avoid the red console line.
- [x] Title backdrop `fetchpriority="high"` and `preconnect` to `image.tmdb.org` added in Task 20B (test: `title.page.spec.ts`, smoke header check). No measurable lab effect, kept as correct practice.

Frontend:

- [ ] **P2** **PrimeNG 22.1.4 motion components (Accordion, Panel, Fieldset) break under SSR hydration.** Workaround: `ngSkipHydration` on `cv-seasons` (comment in the code). Do not use another motion component on a server-rendered page without checking; re-test on every PrimeNG upgrade.
- [ ] **P3** Deferred review minors that matter (PR in brackets): refresh failure on a network error or 5xx clears the session, consider clearing only on 401, and the cross-tab refresh lock has no timeout (#13); My List toggle label plus `aria-pressed` double-encodes state (#15, #17); the paginator hides first/last/ellipses below 640px (#16); the deferred toast chunk has no `@error` fallback (#17); focus drops to the body after a Retry lands in the expired state (#18); a pending favorite removal is lost on tab close or `pagehide` (#19); the admin Users page does GET-before-PATCH (a stale overwrite window), says "can log in again" after unblocking a never-verified user who returns to PENDING, its `p-table` has no accessible name, an outside click on the delete popup does not return focus, and search and page are not in the URL (#25); `robots.txt` `Disallow` hides the `noindex` of the auth pages, a non-404 4xx on the title detail answers 503, canonical of `?page=2` points at the unpaged path (#29).
- [x] Input typed before hydration was wiped on the auth forms: FIXED. The five server-rendered auth forms carry `cvPreHydration` (`shared/directives/pre-hydration-form.directive.ts`): it notes the typed values when the form is created and, after the first render, puts back what hydration cleared and fires `input`, so the form model has them too (the box kept its text in the e2e but the model was empty, so Create account answered "Enter your name."). Smoke: holds every script back, types, releases, then submits. The same directive makes those forms `method="post"`: **a submit before hydration used to put the email and the password in the URL** (`/login?ng.form4.email=...&ng.form4.password=...`: browser history, proxy and access logs), found while fixing this; the POST is answered with the login page again (200), so the fields are lost on that rare path but never logged. Smoke: scripts off, Enter, no field in the URL.
- [x] Route changes did not scroll to the top or restore the scroll position: FIXED with `withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })` in `app.config.ts`; the manual scroll-to-top calls of the title page and `injectPageNavigator` are gone. Smoke: Home scrolled, to Movies, Back returns well below the top. Known limit: Back restores to where the page can be at that moment, and the Home rows load after the router restores, so it lands close to, not exactly on, the old position (1406 px for 1614 px in one run). Every navigation scrolls to the top now, including a filter or page change in the query string (the favorites filter pills too).
- [ ] **P3** 20A minors: the `primeicons` `.svg` file is cached for one hour (not hashed like the other font files); no spec for `ResponseStatus.set(503)` followed by `noStore()`.
- [ ] **P3** The nav search box is a deferred block that hydrates on first use (`@defer (hydrate on interaction; hydrate when searchOpen())`, code prefetched on idle), so Angular Forms is not in the initial bundle. The smoke covers laptop and phone use, and no NG error in the console. Not covered: typing and pressing Enter in the first milliseconds on a very slow link, before the box has hydrated (Angular replays the events, but a native form submit cannot be replayed).
- [ ] **P3** The PrimeIcons font is a 23-icon subset (`frontend/src/styles/primeicons.css`, `fonts/primeicons-subset.woff2`). Adding an icon means re-subsetting the font; `theme/primeicons.spec.ts` fails when app code uses a `pi-*` class that is missing. Same for `theme/cinevault-preset.spec.ts`, which fails when a `primeng/<component>` import has no Aura tokens in the slim preset.
- [x] The logged-out hard reload of `/dashboard/**` showing the nav for a frame is FIXED (Task 20A, #29: `app.ts` ignores a guard-redirect `NavigationCancel`; spec in `app.spec.ts`, verified in Chrome at CPU x1 and x6).
- [ ] **P3** `users.page.spec` has a cold-start timing flake under machine load (seen in about 2 of 6 loaded runs, clean when run alone; run `ng test` on its own).
- [ ] **P3** `ng build` crashed once with a native exit code (3221225477) during Task 20B on this Windows machine; the e2e build retries once. Not reproduced since.

Backend (audit `run-1`, none are confirmed vulnerabilities; the two confirmed findings are fixed or accepted: the MEDIUM email-token one in #11, the LOW pre-registration one is the owner decision above):

- [ ] **P2** Block-list marker lives in the shared, evictable cache with attacker-fillable catalog keys: with a Redis eviction policy, or Redis down (memory LRU), a block marker can be evicted early. Check production `maxmemory-policy`; consider a separate store or a longer-lived key.
- [ ] **P2** Email issuance has no per-recipient or per-account budget (an anonymous caller can repeatedly mail an address and void its earlier verify/reset link). Per-IP limit only (5/min).
- [x] Login CSRF: FIXED. `POST /auth/login` (and `/auth/refresh`) sit behind `JsonOnlyGuard` (`auth/json-only.guard.ts`): a form-encoded or text/plain body is 415 `UNSUPPORTED_MEDIA_TYPE` with no `Set-Cookie`, before the validation pipe. Test: `hardening.e2e-spec.ts`.
- [x] Password-checking `/me` routes on the global limit: FIXED. Change password, change email and delete account share one `PasswordCheckThrottle` (5 per minute per IP, one bucket across the three, `common/throttle.ts`): the 6th guess in a minute is 429 whichever route it goes to. Per IP, not per account (the throttler runs before the JWT guard); the per-account lockout stays in the account-policies item. Test: `hardening.e2e-spec.ts`.
- [ ] **P2** TMDB outbound budget: uncached catalog misses and `GET /me/favorites` for deleted titles spend the single operator token, bounded only by a per-IP, per-process throttle. Check TMDB's real limits.
- [ ] **P3** A unit test that the TMDB token never appears in logs or in an `AppException` body (the token is not logged today; keep it so).
- [ ] **P3** Hardening notes: a `cv_refresh=j:{}` cookie reaches `hashOpaque` and answers 500 (treat non-strings as absent); a BLOCKED user with a live token and no marker can still rename the account and write favorites (reuse `authenticate()`'s status check); `class-validator` `IsEmail` accepts quoted local parts; the throttler tracker keys the full IPv6 address instead of the /64; `runInBackground` and the unpooled SMTP transport have no concurrency bound; `lockAndLoad` raises `LAST_ADMIN` before the actor check (one bit to a demoted admin); `prisma.config.ts` loads `.env` from the working directory; no `ignore-scripts` policy.
- [ ] **P3** Deferred review minors (#2 to #11): TMDB `Retry-After` cap untested and the worst case of one TMDB call is about 10 s; no circuit breaker when Redis is black-holed (about 1 s per request); logout has no Origin/Content-Type check (forced-logout nuisance, #5); role and block staleness up to 10 minutes by design; `TRUST_PROXY=true` is allowed in production (documented as spoofable, #9); favorites `ids` is unbounded and `add` does not verify the title exists (#7).

### 2.4 What the e2e could not cover

- Phone viewport (390px), browsers other than Chrome, and the real TMDB (the stub serves fixtures; TMDB images are served by Playwright/Lighthouse stand-ins).
- Rate limiting: the stack runs with `THROTTLE_DISABLED=true`, so 429 behaviour (and `RATE_LIMITED` messages) is covered by unit and backend e2e tests only.
- Forgot/reset password, change email/password, account deletion, role change, last-admin and self-action errors on the real backend (covered by backend e2e and frontend unit tests, not by this smoke).
- Cross-tab refresh single-flight (`navigator.locks`), the PrimeNG license badge, TLS/proxy behaviour, and the email provider.

## 3. Results

Run on 2026-11-13, Windows 11, Node 24.18.0, Chrome (system, headless), Docker compose postgres 17 / redis 7 / Mailpit 1.33.

### Tests

| Command                                                                   | Result                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `backend`: `npm run format:check`, `npm run lint:ci`, `npm run typecheck` | pass, pass, pass                                           |
| `backend`: unit (`jest`)                                                  | 11 suites, 80 tests, all pass                              |
| `backend`: e2e (`jest --config ./test/jest-e2e.json`)                     | 11 suites, 185 tests, all pass                             |
| `frontend`: `npx ng test --watch=false`                                   | 66 files, 539 tests, all pass                              |
| `frontend`: `npm run lint`, `npm run format:check`, `npm run build`       | pass, pass, pass (initial 670.98 kB, warning limit 750 kB) |
| `e2e`: `npm test` (Playwright, run twice back to back)                    | 11 passed (about 43 s)                                     |

(The backend commands were run as `npx jest` and `node scripts/migrate-test.js && npx jest --config ./test/jest-e2e.json`, i.e. `npm test` and `npm run test:e2e` without their `prisma generate` pre-step, so the generated client that a running dev watcher compiles was not rewritten.)

### Production build sizes (`ng build`)

| Asset                                                                            | Raw       | Estimated transfer |
| -------------------------------------------------------------------------------- | --------- | ------------------ |
| Initial total (JS + CSS)                                                         | 670.98 kB | 170.34 kB          |
| CSS (`styles-*.css`, Tailwind + PrimeNG)                                         | 54.17 kB  | 9.60 kB            |
| Initial JS (`main` 202.36 kB, two shared chunks 222.81 and 190.74 kB, one small) | 616.82 kB | 160.74 kB          |

### Lighthouse 13.6.0, mobile, production build behind the e2e proxy (brotli), stub TMDB, median of 3 runs

After the bundle and hero changes of the LCP work (before them: Slow 4G `/` 86 / 3.62 s, title 92 / 3.32 s; 4G `/` 2.07 s, title 1.90 s). Default throttling (simulated Slow 4G: 150 ms RTT, 1.6 Mbps, 4x CPU slowdown):

| Page               | Performance          | Accessibility | Best Practices | SEO | FCP    | LCP                   | CLS   | TBT    |
| ------------------ | -------------------- | ------------- | -------------- | --- | ------ | --------------------- | ----- | ------ |
| `/`                | 95 (runs 92, 95, 96) | 100           | 96             | 100 | 0.93 s | 2.42 s (2.42 to 3.05) | 0.002 | 172 ms |
| `/title/movie/603` | 97 (runs 96, 97, 97) | 100           | 96             | 100 | 0.88 s | 2.50 s (2.50 to 2.50) | 0.019 | 86 ms  |

"4G" profile (simulated 170 ms RTT, 9 Mbps, 4x CPU; `node lighthouse.mjs 3 --4g`), the literal reading of PRD section 4:

| Page               | Performance | Accessibility | Best Practices | SEO | FCP    | LCP    | CLS   | TBT    |
| ------------------ | ----------- | ------------- | -------------- | --- | ------ | ------ | ----- | ------ |
| `/`                | 93          | 100           | 96             | 100 | 0.98 s | 1.72 s | 0.002 | 315 ms |
| `/title/movie/603` | 99          | 100           | 96             | 100 | 0.95 s | 1.72 s | 0.019 | 92 ms  |

Against the PRD targets: CLS under 0.1 passes everywhere. LCP under 2.5 s passes on the 4G profile and is at the threshold on Lighthouse's default Slow 4G (2.42 s Home, 2.50 s title; open item in 2.3). Caveats of the setup, all of which make the lab numbers differ from production:

- TMDB images are tiny generated PNGs from a local HTTPS stand-in for `image.tmdb.org` (so the numbers measure our HTML, CSS, JS and fonts, not TMDB's CDN; a real 100 KB backdrop adds time on a slow link, and the image-delivery insight on the title page is an artifact of the PNG stand-ins).
- The proxy in front is HTTP/1.1 and compresses with brotli level 5; a real HTTP/2 or HTTP/3 edge changes request scheduling.
- Google Fonts is a real request; no PrimeNG license key is set (the badge is present); Best Practices loses 4 points on the visitor `401` console line (open item).
- `fetchpriority="high"` is on the title backdrop, which is the LCP element on a phone, while the poster frame is also high priority: if the poster becomes the LCP element on another layout, revisit.

The raw Lighthouse JSON reports are written to the gitignored `e2e/.lighthouse` (`home-default-N.json`, `home-4g-N.json`, `title-default-N.json`, `title-4g-N.json`) and are not committed; they are reproduced with `cd e2e && npm run lighthouse -- 3` and `npm run lighthouse -- 3 --4g`.
