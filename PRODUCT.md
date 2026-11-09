# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Angular (SSR for public pages) frontend, NestJS backend, PostgreSQL + Prisma, Redis cache. Chosen by the owner (Angular, NestJS) and by the assistant with owner approval (rest). Design mockups are plain HTML/CSS.

## Users

Everyone: general public who like movies and series. Phones and laptops (mobile-first). Roles: visitor (no login), registered user (favorites, account), admin (manages users).

## Product Purpose

Cinevault is the owner's own public movie and series catalog. Visitors browse and search all of TMDB live and read details (overview, cast, trailer, seasons). Registered users keep a favorites list in a dashboard. Admins manage users (role, block/unblock, delete) and see a small overview.

## Positioning

Streaming-site feel for discovery without playback. The owner's differentiator is a per-title Download button, currently a non-functional placeholder behind a feature flag (off in production until a legal review is done).

## Operating Context

All title data comes live from TMDB through the backend (cached in Redis). TMDB attribution is required in the footer. Sign-up requires email verification; password change needs the old password; forgot-password by emailed link.

## Capabilities and Constraints

- Public pages: Home, TV Shows, Movies, New & Popular, Search, Genre, Title detail, Login, Register, Forgot password.
- User dashboard: Favorites (All / Movies / Series filter), Account (name, email, change password, delete account).
- Admin dashboard: Users (search, role, block/unblock, delete) and Overview (total users, new this week).
- Non-goals: video playback, Continue Watching, notifications, admin adding titles, social login, multi-language UI.
- English only.

## Brand Commitments

Name: Cinevault. The owner supplied a dark streaming-site reference image (hero carousel, poster rows, genre tiles, top nav with search and avatar, "My List"); it is a binding starting point for the look. Image: docs/design/reference.jpg.

## Evidence on Hand

No real users, no testimonials, no statistics. Title data, posters and backdrops come from TMDB at runtime; mockups use placeholders or synthetic titles and must be labeled as such.

## Product Principles

- Content leads: posters and backdrops are the interface; chrome recedes.
- One catalog, two depths: fast browse for visitors, quiet utility for the dashboard.
- Honest by default: never imply files are hosted or downloadable while the flag is off; always credit TMDB.
- Mobile-first: every screen must work at phone width first.

## Accessibility & Inclusion

Readable on phones: body text at least 14px, contrast at least 4.5:1, keyboard focus visible, poster art always paired with a text title.
