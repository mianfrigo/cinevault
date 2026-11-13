# Cinevault v1 launch checklist

Status as of Task 20B (2026-11-13). A box is checked only when the repository, a test or a recorded run proves it; everything else is open with an owner and a next step. Owners: **you** (the project owner/developer), **ops** (whoever deploys and runs it), **legal**, **product** (decisions).

## 1. Release criteria (docs/PRD.md section 9)

- [ ] **1. All features in section 5 work on phone (390px) and laptop (1440px) widths.**
  - Evidence so far: Chrome checks at 390 and 1440 were done per task (see each `task-*-report.md`), and the smoke runs a desktop viewport (1280x720) only. Nothing automated covers 390px. Owner: you. Next: one manual pass of every screen at 390 and 1440, or add a 390px Playwright project to `e2e/playwright.config.ts`.
- [x] **2a. Backend tests and frontend tests pass.** Backend 80 unit + 183 e2e, frontend 478 (see Results). Commands: `cd backend && npm test && npm run test:e2e`, `cd frontend && npx ng test --watch=false`.
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
- [ ] **GitHub:** branch protection requires `CI OK`; enable secret scanning and push protection; keep the `npm audit` gate.
- [ ] **Content-Security-Policy** (P2). Only `frame-ancestors 'none'` is set. A full policy needs nonces for Angular SSR inline scripts and styles, PrimeNG's runtime styles, Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) and `image.tmdb.org`, and a pass in Chrome with devtools open.
- [ ] **Sitemap and `/search` noindex** (P3): not done; `robots.txt` lists the private routes.

### 2.2 Legal and product decisions

- [ ] **TMDB commercial-license answer** (blocker, criterion 4).
- [ ] **Download button legal review** (PRD section 7: off in production until the owner records a sign-off). The button, its hydration with the flag on, and the "coming soon" toast are tested; the feature behind it is not built.
- [ ] **Terms and Privacy text** (criterion 5b), including what the product stores (email, password hash, favorites) and the cookie.
- [ ] **Pre-registration takeover, residual** (Task 6 decision, audit LOW finding). Re-registering a PENDING address overwrites the name and password, so anyone who knows an unverified address can set the password the victim's next verification click will activate. Options: require the password at verify time, or bind the password hash to the verification token. Owner decision.
- [ ] **Adult content on detail pages** (audit lead; PRD section 7 says `include_adult=false` on every TMDB call, TRD only lists list, search and discover). Detail, season, similar and favorites pages by id have no adult gate. Check with your own TMDB token whether `/movie/{id}` and `/tv/{id}` return `adult: true` titles and decide whether to filter in the mapper.
- [ ] **Account policies not implemented:** per-account login throttle or lockout (only per-IP limits and argon2 cost); absolute refresh-token session cap (tokens slide for 30 days on every rotation; consider a 90 day cap); the old address is not notified when an email change completes; no revoke of other sessions on email change.

### 2.3 You: engineering follow-ups

Performance (Task 20B Lighthouse, see Results):

- [ ] **LCP on the Lighthouse default (Slow 4G, 1.6 Mbps) misses 2.5 s** (Home 3.6 s, Title 3.3 s medians); on a 9 Mbps / 170 ms "4G" profile both pass (2.1 s, 1.9 s). Cost drivers, measured: ~510 KB on the wire for Home/Title (initial JS 760.66 kB raw / ~182 kB transfer, plus ~270 KB of route chunks and PrimeNG), an 89 KB legacy `primeicons.eot` that the critical-CSS step preloads although browsers use the woff2 (removing the preload alone moved Title LCP 3.3 s to 2.9 s and Home 4.3 s to 3.3 s in an experiment; fix by vendoring a PrimeIcons stylesheet without the legacy `src` entries, or by an Angular build option when one exists), Google Fonts, and the PrimeNG footprint. Next: trim the initial chunk; the Angular budget warns at 850 kB and the initial total is 827.00 kB (23 kB of headroom).
- [ ] **A visitor without a session logs a console error on every page load**: the first `POST /api/v1/auth/refresh` answers 401 (Lighthouse Best Practices 96 instead of 100, "errors in console"). A non-401 "no session" answer or a non-HttpOnly marker cookie would avoid the red console line.
- [x] Title backdrop `fetchpriority="high"` and `preconnect` to `image.tmdb.org` added in Task 20B (test: `title.page.spec.ts`, smoke header check). No measurable lab effect, kept as correct practice.

Frontend:

- [ ] **PrimeNG 22.1.4 motion components (Accordion, Panel, Fieldset) break under SSR hydration.** Workaround: `ngSkipHydration` on `cv-seasons` (comment in the code). Do not use another motion component on a server-rendered page without checking; re-test on every PrimeNG upgrade.
- [ ] Deferred review minors that matter (PR in brackets): refresh failure on a network error or 5xx clears the session, consider clearing only on 401, and the cross-tab refresh lock has no timeout (#13); My List toggle label plus `aria-pressed` double-encodes state (#15, #17); the paginator hides first/last/ellipses below 640px (#16); the deferred toast chunk has no `@error` fallback (#17); focus drops to the body after a Retry lands in the expired state (#18); a pending favorite removal is lost on tab close or `pagehide` (#19); the admin Users page does GET-before-PATCH (a stale overwrite window), says "can log in again" after unblocking a never-verified user who returns to PENDING, its `p-table` has no accessible name, an outside click on the delete popup does not return focus, and search and page are not in the URL (#25); `robots.txt` `Disallow` hides the `noindex` of the auth pages, a non-404 4xx on the title detail answers 503, canonical of `?page=2` points at the unpaged path (#29).
- [ ] `users.page.spec` has a cold-start timing flake under machine load (seen in about 2 of 6 loaded runs, clean when run alone; run `ng test` on its own).
- [ ] `ng build` crashed once with a native exit code (3221225477) during Task 20B on this Windows machine; the e2e build retries once. Not reproduced since.

Backend (audit `run-1`, none are confirmed vulnerabilities; the two confirmed findings are fixed or accepted: the MEDIUM email-token one in #11, the LOW pre-registration one is the owner decision above):

- [ ] Block-list marker lives in the shared, evictable cache with attacker-fillable catalog keys: with a Redis eviction policy, or Redis down (memory LRU), a block marker can be evicted early. Check production `maxmemory-policy`; consider a separate store or a longer-lived key.
- [ ] Email issuance has no per-recipient or per-account budget (an anonymous caller can repeatedly mail an address and void its earlier verify/reset link). Per-IP limit only (5/min).
- [ ] Login CSRF: `POST /auth/login` accepts a form-encoded body, so a cross-site form can plant the attacker's refresh cookie. Restrict to `application/json`.
- [ ] Password-checking `/me` routes use the global 100/min limit, not the strict auth limit (a faster password oracle than login and per-IP argon2 load).
- [ ] TMDB outbound budget: uncached catalog misses and `GET /me/favorites` for deleted titles spend the single operator token, bounded only by a per-IP, per-process throttle. Check TMDB's real limits.
- [ ] Hardening notes: a `cv_refresh=j:{}` cookie reaches `hashOpaque` and answers 500 (treat non-strings as absent); a BLOCKED user with a live token and no marker can still rename the account and write favorites (reuse `authenticate()`'s status check); `class-validator` `IsEmail` accepts quoted local parts; the throttler tracker keys the full IPv6 address instead of the /64; `runInBackground` and the unpooled SMTP transport have no concurrency bound; `lockAndLoad` raises `LAST_ADMIN` before the actor check (one bit to a demoted admin); `prisma.config.ts` loads `.env` from the working directory; no `ignore-scripts` policy.
- [ ] Deferred review minors (#2 to #11): TMDB `Retry-After` cap untested and the worst case of one TMDB call is about 10 s; no circuit breaker when Redis is black-holed (about 1 s per request); logout has no Origin/Content-Type check (forced-logout nuisance, #5); role and block staleness up to 10 minutes by design; `TRUST_PROXY=true` is allowed in production (documented as spoofable, #9); favorites `ids` is unbounded and `add` does not verify the title exists (#7).

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
| `backend`: e2e (`jest --config ./test/jest-e2e.json`)                     | 11 suites, 183 tests, all pass                             |
| `frontend`: `npx ng test --watch=false`                                   | 60 files, 478 tests, all pass                              |
| `frontend`: `npm run lint`, `npm run format:check`, `npm run build`       | pass, pass, pass (initial 827.00 kB, warning limit 850 kB) |
| `e2e`: `npm test` (Playwright, run twice back to back)                    | 5 passed, 5 passed (about 34 s each)                       |

(The backend commands were run as `npx jest` and `node scripts/migrate-test.js && npx jest --config ./test/jest-e2e.json`, i.e. `npm test` and `npm run test:e2e` without their `prisma generate` pre-step, so the generated client that a running dev watcher compiles was not rewritten.)

### Production build sizes (`ng build`)

| Asset                                                                            | Raw       | Estimated transfer |
| -------------------------------------------------------------------------------- | --------- | ------------------ |
| Initial total (JS + CSS)                                                         | 827.00 kB | 193.81 kB          |
| CSS (`styles-*.css`, Tailwind + PrimeNG)                                         | 66.34 kB  | 11.46 kB           |
| Initial JS (`main` 346.31 kB, two shared chunks 213.72 and 192.02 kB, two small) | 760.66 kB | 182.35 kB          |

### Lighthouse 13.6.0, mobile, production build behind the e2e proxy (brotli), stub TMDB, median of 3 runs

Default throttling (simulated Slow 4G: 150 ms RTT, 1.6 Mbps, 4x CPU slowdown):

| Page               | Performance          | Accessibility | Best Practices | SEO | FCP    | LCP                   | CLS   | TBT    |
| ------------------ | -------------------- | ------------- | -------------- | --- | ------ | --------------------- | ----- | ------ |
| `/`                | 86 (runs 77, 86, 92) | 100           | 96             | 100 | 0.94 s | 3.62 s (3.17 to 4.14) | 0.002 | 241 ms |
| `/title/movie/603` | 92                   | 100           | 96             | 100 | 0.88 s | 3.32 s (3.32 to 3.32) | 0.019 | 82 ms  |

"4G" profile (simulated 170 ms RTT, 9 Mbps, 4x CPU; `node lighthouse.mjs 3 --4g`), the literal reading of PRD section 4:

| Page               | Performance | Accessibility | Best Practices | SEO | FCP    | LCP    | CLS   | TBT    |
| ------------------ | ----------- | ------------- | -------------- | --- | ------ | ------ | ----- | ------ |
| `/`                | 91          | 100           | 96             | 100 | 1.03 s | 2.07 s | 0.001 | 339 ms |
| `/title/movie/603` | 99          | 100           | 96             | 100 | 0.98 s | 1.90 s | 0.019 | 107 ms |

Against the PRD targets: CLS under 0.1 passes everywhere. LCP under 2.5 s passes on the 4G profile and misses on Lighthouse's default Slow 4G (open item in 2.3). Notes on the setup: TMDB images are tiny generated PNGs from a local HTTPS stand-in for `image.tmdb.org` (so the numbers measure our HTML, CSS, JS and fonts, not TMDB's CDN; a real 100 KB backdrop adds time on a slow link); Google Fonts is a real request; no PrimeNG license key is set; Best Practices loses 4 points on the visitor `401` console line (open item). Raw reports are in `e2e/.lighthouse` (gitignored).
