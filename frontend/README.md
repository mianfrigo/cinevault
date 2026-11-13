# Cinevault frontend

Angular 22 (SSR) with PrimeNG 22 and Tailwind CSS v4. Design tokens live in `src/styles/theme.css` and `src/app/theme/cinevault-preset.ts`; keep them in sync.

## Scripts

| Command          | What it does                                                                   |
| ---------------- | ------------------------------------------------------------------------------ |
| `npm start`      | Dev server on http://localhost:4200, `/api` proxied to `http://localhost:3000` |
| `npm run build`  | Production SSR build into `dist/frontend`                                      |
| `npm test`       | Unit tests (Vitest through `ng test`)                                          |
| `npm run lint`   | ESLint (angular-eslint)                                                        |
| `npm run format` | Prettier write (`npm run format:check` to verify)                              |

## Notes

- Running the built server (`node dist/frontend/server/server.mjs`) needs the allowed hosts set, for example `NG_ALLOWED_HOSTS=localhost`. See Deployment notes.
- PrimeNG 22 needs a PrimeUI license key. Without one the console warns and an "Invalid PrimeUI License" badge shows on every page. Put it in `frontend/.env` as `PRIMENG_LICENSE_KEY` (copy `.env.example`; `.env` is gitignored). See Deployment notes.
- SSR HTTP transfer cache: the browser calls the API on its own origin (`/api/v1`, made absolute in `app.config.ts`), the server on `API_INTERNAL_URL`. `HTTP_TRANSFER_CACHE_ORIGIN_MAP` (server config only) maps the internal origin to the origin the page was requested on, so the browser reuses the server's responses. Manual check: load `/` through the public origin with the browser devtools Network tab open; no `/api/v1/catalog/*` GET may appear (only `POST /auth/refresh`).

## Deployment notes

Environment variables of the SSR server (`node dist/frontend/server/server.mjs`). The server also reads an optional gitignored `frontend/.env` (see `.env.example`); variables already set in the shell win.

| Variable              | Purpose                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NG_ALLOWED_HOSTS`    | **Required.** Comma-separated host names the server answers to (`cinevault.example,www.cinevault.example`).            |
| `SITE_URL`            | Canonical public URL (`https://cinevault.example`). Canonical links and `og:url` use its origin. Set it in production. |
| `API_INTERNAL_URL`    | Where the SSR server reaches the API (default `http://localhost:3000`).                                                |
| `PRIMENG_LICENSE_KEY` | PrimeNG license key (optional; without it PrimeNG warns and shows its badge).                                          |
| `PORT`                | Listen port (default 4000).                                                                                            |

- **Allowed hosts fail closed.** With `NG_ALLOWED_HOSTS` unset or a request whose `Host` (or `X-Forwarded-Host`) is not on the list, Angular SSR answers `400` and renders nothing. Production must set it to its real host names; it protects against host header poisoning. `X-Forwarded-Host` is ignored for the origin used in canonical links.
- **Canonical origin.** `SITE_URL` wins; without it the origin of the (host-validated) request is used. Behind a TLS-terminating proxy that origin can read `http:`, so `SITE_URL` is the safe way to get the `https` canonical. The chosen origin is handed to the browser through transfer state, so hydration keeps the same canonical link.
- **Proxy headers.** `NG_TRUST_PROXY_HEADERS` (comma-separated header names, e.g. `x-forwarded-host,x-forwarded-proto`) is unset by default: `X-Forwarded-*` headers are ignored (and logged). When set, the listed forwarded headers drive the request URL (host and protocol) and are validated against `NG_ALLOWED_HOSTS` like `Host`. Only list headers your proxy overwrites, never ones a client can send through.
- **PrimeNG license.** The key is validated in the browser, so it necessarily reaches the browser (the server hands it over through transfer state into `providePrimeNG({ license })`). It is not a server secret, but it must never be committed: it lives in the environment (or the gitignored `.env`) only.
- **Caching and headers** (`src/server.ts`, `src/server/response-headers.ts`). Every response starts at `Cache-Control: no-store`; only a 200 catalog page (`/`, `/movies`, `/tv`, `/new`, `/search`, `/genre/:type/:id`, `/title/:type/:id`, `/terms`, `/privacy`) is upgraded to `public, s-maxage=300, stale-while-revalidate=600`. A page whose primary content cannot be loaded (title detail, browse list, search results, both New & Popular lists) answers `503` with `Retry-After: 30`; a page missing a secondary part (a Home row, the genre chips, a season's episodes, one of the two New & Popular lists) stays `200` but `no-store`; unknown pages, titles and malformed title URLs answer `404` (`no-store`). Hashed build files (scripts, styles, fonts with an 8 character hash) are `immutable` for a year; `robots.txt`, the favicon and everything else cache for an hour. Every response carries `Referrer-Policy: no-referrer` (the reset-password and verify-email links hold one-time tokens), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. A full CSP is not set yet (launch checklist).
- **`NODE_ENV=production`.** Run the server with it set: Express then hides stack traces from error responses (and the Angular app runs in production mode).
- **TMDB attribution.** The footer shows the required notice "This product uses the TMDB API but is not endorsed or certified by TMDB." (`cv-tmdb-credit`). Keep it on every public page.
- **SEO.** `SeoService` (`src/app/core/seo`) sets the title, description, canonical, Open Graph and Twitter tags on every route; the auth, dashboard and admin pages are `noindex, nofollow` and disallowed in `public/robots.txt`.

## Conventions

- Forms use Angular Signal Forms only (`@angular/forms/signals`: `form()`, schema validators, `[formField]`, `[formRoot]`). No Reactive Forms (`FormControl`, `FormGroup`, `FormBuilder`, `ReactiveFormsModule`) and no template-driven forms (`ngModel`, `FormsModule`). PrimeNG controls bind with `[formField]` too.
- Use PrimeNG components wherever one exists, styled with Tailwind utilities and the theme tokens.
- Ratings use PrimeNG `p-rating` (see `cv-score`), never a custom star component.
- No function or method calls in templates (they run on every change detection). Read signals and computeds, use a pure pipe (`initials`) or precompute a view-model `computed`. Signal reads, `track` expressions and `(event)` handlers are fine.
- A custom form control implements `FormValueControl<T>` from `@angular/forms/signals` (a `value` model, optional `disabled`/`invalid` inputs, a `touch` output on blur, `focus()`) and is bound with `[formField]`. It wraps the PrimeNG control (`cv-password-input`, `cv-role-select`); no `ControlValueAccessor`.

### Code structure

- One decorated class (`@Component`, `@Directive`, `@Pipe`) or service per file, enforced by the ESLint rule `max-classes-per-file` (spec-local test hosts are exempt). Name files `<name>.component.ts`, `<name>.directive.ts`, `<name>.pipe.ts`.
- `src/app/shared` is stateless UI and helpers, split by kind: `components/<name>/<name>.component.ts` (one folder per component, spec colocated), `directives/`, `pipes/`, `services/`, `utils/` (flat) and `validators/`. `core/` holds singletons and the API contract, `shell/` the app chrome, `pages/` routed standalone pages, `features/<name>/` everything specific to one feature.
- Import from `shared/` and `core/` with the aliases `@shared/*` and `@core/*` (`tsconfig.json` `paths`); imports inside a feature (or inside one `shared` component folder) stay relative.
- No barrel (`index.ts`) files: import each symbol from the file that defines it.
