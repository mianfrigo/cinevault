# Cinevault: Design

Date: 2026-11-09. Status: draft for approval.

## 1. Intent and why

Cinevault is the owner's own public web product: a movie and series catalog with a streaming-site look (dark theme, hero carousel, poster rows). Visitors browse, search, and read details for any title on TMDB. Registered users keep a favorites list. Admins manage users.

The owner's stated differentiator is a per-title **Download** button. For now this is a **non-functional placeholder**. Legal review of any real file delivery is explicitly deferred by the owner.

## 2. Goals

- Public, fast, indexable catalog of all TMDB movies and series, fetched live.
- Search, browse by category and genre, and a detail page per title.
- Verified accounts with a personal dashboard: favorites and account settings.
- Role-based access (`user`, `admin`) with an admin area for user management.
- Mobile-first responsive UI that works on phones and laptops.

## 3. Non-goals (for now)

- Serving, hosting, or linking to any video file. The Download button does nothing real.
- Video playback, "Continue Watching", watch history, notifications.
- Admin adding or editing titles. The catalog is TMDB, not a local copy.
- Social login, TV or native apps, multiple languages in the UI, payments.

## 4. Anti-goals (failure even if it "works")

- TMDB API key exposed to the browser.
- A blocked user keeps access for long after being blocked.
- Public pages not indexable (no SSR), or slow because every request hits TMDB.
- Any feature that makes Cinevault look like it hosts pirated content before the legal check is done.

## 5. Decisions made by the owner

- Backend: Node.js with NestJS. Frontend: Angular.
- Catalog source: all of TMDB, live (no admin-imported catalog).
- Cache: Redis (via Nest cache manager).
- Visual direction: the owner's reference image (dark streaming UI), refined. **Approved look: `docs/design/directions/a2-streamline-premium.html`** (clickable mockup of all screens: home, title movie/series, favorites, account, admin users, admin overview, login, register, forgot password, check-your-email). Flat desaturated ink ground, one muted indigo accent, sentence-case Schibsted Grotesk, hairline borders, no glows, single "★ 8.6" rating, restrained synthetic key-art. Two other explored directions (`b-gallery-dark.html`, `c-title-sequence.html`) and the first version (`a-streamline.html`) are rejected; kept for reference only. The older wireframes in `docs/design/mockups/` are superseded.
- Email verification required before an account is usable.
- Change password (logged in) requires the old password. "Forgot password" via emailed reset link is included.
- Devices: phones and laptops.
- App name: Cinevault. Code lives in `C:\Users\darks\Desktop\Cinevault`.
- Admin dashboard: Users and Overview pages. Overview kept.
- Frontend UI (decided 2026-11-09, after the first design approval): PrimeNG for components instead of building our own, Tailwind CSS v4 for all styling (no hand-written component CSS), and NgRx SignalStore where it fits (global session and favorites, page-level interaction state; read-only fetches use resources). The approved mockup look is reproduced through a Tailwind theme plus a PrimeNG preset. Details: `docs/TRD.md` sections 4.1 and 4.2.
- Download button is built behind a feature flag: on in development, off in production until the legal review is done. Launch checklist item: confirm flag is off.

## 6. Scope by role

**Visitor (no login):** Home, TV Shows, Movies, New & Popular, Search, Genre pages, Title detail, Login, Register, Forgot password. Clicking Add to My List prompts login.

**User:** everything above, plus Dashboard:
- Favorites: grid with All / Movies / Series filter, remove favorite.
- Account: edit name, change email (re-verifies), change password (old password required), delete own account (removes favorites).

**Admin:** everything a user has, plus:
- Users: search by name/email, view list, change role, block/unblock, delete user.
- Overview: total users, new users this week.

## 7. Pages and behaviors (from approved mockups)

Source of truth for visuals: the approved mockup `docs/design/directions/a2-streamline-premium.html` (all design tokens are CSS custom properties on `:root`, ready to port to Angular). Its origin is the owner's reference image `docs/design/reference.jpg` (minus Continue Watching, Play Now and the notifications bell). Where this text and the mockup differ, the mockup wins for look and layout, this text wins for behavior. Mockup poster art is synthetic; real posters and backdrops come from TMDB.

- **Home:** top nav (logo, Home, TV Shows, Movies, New & Popular, My List, search box, avatar or Login). Hero carousel of trending titles with Details and Add to My List. Poster rows: Trending Movies, New Release TV Shows, Popular Genres (tiles), Top Rated (the reference's "Award-Winning Films"). Footer: Account, Help Center, Terms, Privacy, TMDB attribution.
- **Title detail:** backdrop, poster, title, year, rating, runtime, genres, type. Buttons: Watch trailer (TMDB video link), Add to My List, Download (dashed placeholder, no action; shows a "coming soon" message; rendered only when the `downloadButton` feature flag is on, default off in production). Overview, top cast, seasons and episodes (series only), director/language/status, More like this.
- **Dashboard:** sidebar layout. User sidebar: Favorites, Account, Back to site, Log out. Admin adds Users and Overview.

## 8. Architecture (owner's stack, builder's details)

- `frontend/`: Angular with SSR for public pages, PrimeNG components, Tailwind CSS v4, NgRx SignalStore (selectively).
- `backend/`: NestJS REST API. Modules: auth, users, favorites, catalog (TMDB proxy), admin, mail.
- PostgreSQL via Prisma (assistant's call, owner didn't object).
- Redis: TMDB response cache and refresh-token revocation.
- TMDB is called only from the backend. TTLs (assistant's call): details/credits 24h, trending/popular/top-rated 1h, search 10min.
- Auth (assistant's call): argon2 password hashes, short-lived JWT access token, refresh token in httpOnly cookie, role guard. Blocking a user revokes their refresh tokens in Redis and the access token TTL is short.
- Email (assistant's call): Resend in production, Mailpit locally. Used for verification, password reset, email change.
- First admin created by a seed script (assistant's call).
- Favorites store only `tmdbId` and `mediaType`. No local title table (assistant's call). Title details for the favorites grid come from the cached TMDB proxy.
- API rate limiting on public endpoints and stricter limits on auth endpoints (assistant's call).

## 9. Constraints and risks

- TMDB requires visible attribution. Its API terms may require a separate commercial license for a commercial product. Owner must confirm before public launch. This is a launch blocker to verify, not a build blocker.
- Download feature legal review is open and deferred by the owner.
- English only. Scale target: public traffic, single region, caching built in from the start.

## 10. Left to the builder

Project layout inside the monorepo, exact REST route design, Prisma schema details, exact component structure, SSR hosting choice, CI, test strategy, PrimeNG preset token values beyond those pinned in the TRD, accessibility details, password policy specifics, token lifetimes.

## 11. Deliverables to produce from this design

PRD, TRD, App flow, UI/UX design brief, Backend schema, Implementation plan. Each goes in `docs/`.
