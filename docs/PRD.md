# Cinevault: Product Requirements Document (PRD)

Status: approved scope, v1. Source of truth for scope: `docs/superpowers/specs/2026-11-09-cinevault-design.md`.

## 1. Summary

Cinevault is a public movie and series catalog with a streaming-site look. Visitors browse, search and read details for any title on TMDB. Registered users keep a favorites list. Admins manage users. There is no video playback. A per-title Download button exists only as a placeholder behind a feature flag that is off in production.

## 2. Problem and opportunity

People who like movies and series want one fast, good-looking place to discover titles and keep a personal list. TMDB has the data but no consumer experience of its own. The owner wants their own product with accounts and, later, a download feature that is explicitly out of scope until a legal review is done.

## 3. Users and roles

| Role | Who | Can do |
|---|---|---|
| Visitor | Anyone, no login | Browse, search, view details, register, log in |
| User | Registered, email verified | Everything a visitor can, plus favorites and account settings |
| Admin | Seeded or promoted by an admin | Everything a user can, plus manage users and see an overview |

Devices: phones and laptops, mobile-first. Language: English only.

## 4. Goals and success measures

- A visitor finds a title and reaches its detail page in 3 interactions or fewer from the home page.
- Public pages load fast: Largest Contentful Paint under 2.5s on a mid-range phone on 4G for Home and Title pages (measured with Lighthouse, cached responses).
- A new user can register, verify email, log in and save a first favorite in under 3 minutes.
- Zero TMDB credentials exposed to the browser.
- A blocked user loses access within the access-token lifetime (10 minutes at most, usually immediately).

## 5. Features (v1)

### 5.1 Public catalog
- **Home:** hero carousel (3 trending titles), rows: Trending Movies, New Release TV Shows, Popular Genres, Top Rated Films.
- **Browse:** TV Shows, Movies, New & Popular, Genre pages, each with paginated grids.
- **Search:** header search and a results page (movies and series), paginated.
- **Title detail:** backdrop, poster, title, year, rating, runtime or seasons, genres, overview, trailer link, top cast, seasons and episodes (series), facts, similar titles, TMDB attribution.
- **Download button:** rendered only when the `downloadButton` flag is on. Does nothing real; shows a "coming soon" message.

### 5.2 Accounts
- Register (name, email, password), email verification required before login.
- Login, logout, session refresh.
- Forgot password (emailed link) and reset password.
- Change password (old password required), edit name, change email (new address is verified), delete own account.

### 5.3 User dashboard
- **Favorites:** grid of saved titles, filter All / Movies / Series, remove a favorite, empty states.
- **Account:** settings listed in 5.2.
- Add to My List is visible to everyone; anonymous visitors are prompted to log in.

### 5.4 Admin dashboard
- **Users:** search by name or email, paginated table, change role, block or unblock, delete user.
- **Overview:** total users, new users in the last 7 days, 5 most recent sign-ups.
- Guard rails: an admin cannot change their own role, block or delete themselves, and the last active admin cannot be demoted, blocked or deleted.

## 6. Non-goals

Video playback, hosting or linking to video files, Continue Watching, watch history, notifications, admin adding or editing titles, social login, multi-language UI, native or TV apps, payments, reviews or ratings by users.

## 7. Rules and constraints

- All title data comes live from TMDB through the backend, cached. The catalog never includes adult content (`include_adult=false` on every TMDB call).
- TMDB attribution must appear in the footer: "This product uses the TMDB API but is not endorsed or certified by TMDB."
- Passwords are never stored in plain text and never logged.
- The Download button is off in production until the owner records a legal sign-off.

## 8. Risks and open items

| Risk | Impact | Mitigation |
|---|---|---|
| TMDB terms may require a commercial license for a commercial product | Launch blocker | Owner confirms with TMDB before public launch |
| Download feature legality | Takedown or liability | Flag off in production; legal review before enabling |
| TMDB outage or rate limit | Empty pages | Redis cache with in-memory fallback, friendly error states with retry |
| Public sign-up abuse | Spam accounts, email costs | Email verification, rate limits on auth endpoints |

## 9. Release criteria (v1 launch checklist)

1. All features in section 5 work on phone (390px) and laptop (1440px) widths.
2. Backend tests and frontend tests pass; the end-to-end smoke test passes against the local stack.
3. `downloadButton` flag is off in production config.
4. TMDB license question answered by the owner.
5. TMDB attribution visible; Terms and Privacy pages have owner-supplied text.
6. First admin created by the seed script; seed credentials rotated.
