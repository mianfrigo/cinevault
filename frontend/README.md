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
