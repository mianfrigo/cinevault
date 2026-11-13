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

- Running the built server (`node dist/frontend/server/server.mjs`) needs the allowed hosts set, for example `NG_ALLOWED_HOSTS=localhost`. Production must set it to the real host name.
- PrimeNG 22 needs a PrimeUI license key (the free Community License is available). Without one the console warns and a "Invalid PrimeUI License" badge shows on every page. The key is passed as `license` to `providePrimeNG` in `src/app/app.config.ts`; it has not been configured yet.
- SSR HTTP transfer cache: the browser calls the API on its own origin (`/api/v1`, made absolute in `app.config.ts`), the server on `API_INTERNAL_URL`. `HTTP_TRANSFER_CACHE_ORIGIN_MAP` (server config only) maps the internal origin to the origin the page was requested on, so the browser reuses the server's responses. Manual check: load `/` through the public origin with the browser devtools Network tab open; no `/api/v1/catalog/*` GET may appear (only `POST /auth/refresh`).

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
