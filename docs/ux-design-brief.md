# Cinevault: UI/UX Design Brief

The approved visual reference is `docs/design/directions/a2-streamline-premium.html`. It is a clickable mockup of every screen. Open it, switch screens with the bar at the bottom, and toggle Visitor / User / Admin. It originates from the owner's reference `docs/design/reference.jpg`. Where this brief and the mockup disagree on look, the mockup wins.

Mockup poster and backdrop art is synthetic. In the product, posters and backdrops come from TMDB.

## 1. Design intent

Premium, calm, cinematic. The posters carry the colour; the interface stays quiet. Think studio-crafted streaming service, not template. Mobile-first.

**Rejected looks (do not drift back):** all-caps condensed display type, glowing neon accent buttons, saturated navy gradients, star-row ratings, pill chips for everything, heavy white circular icon buttons.

## 2. Principles

1. Content leads: poster and backdrop art are the interface; chrome recedes.
2. One catalog, two depths: fast browse for visitors, quiet dense utility in the dashboard.
3. Honest by default: never imply files are hosted or downloadable; always credit TMDB.
4. Every data screen has loading, empty and error states.
5. Restraint: one accent, flat surfaces stepped by lightness, hairline separators, no glows.

## 3. Design tokens

The mockup defines the values as CSS custom properties in its `:root` block (lines 18 to 80 of `a2-streamline-premium.html`). In the product they live in two places that must stay in sync: the Tailwind v4 `@theme` block in `frontend/src/styles/theme.css` (so templates use utilities like `bg-surface-2` and `text-fg-2`) and the PrimeNG preset `frontend/src/app/theme/cinevault-preset.ts` (so PrimeNG components look the same). Do not write raw hex values in templates. The mockup token names (`--c-bg-1`, `--c-text`, `--c-accent`) map to Tailwind names as: `--c-bg-0..4` to `--color-surface-0..4`, `--c-text`, `--c-text-2`, `--c-text-3` to `--color-fg`, `--color-fg-2`, `--color-fg-3`, `--c-accent*` to `--color-accent*`, `--c-line*` to `--color-line*`, status colors to `--color-ok|warn|danger`. Spacing uses Tailwind's default 4px scale, which matches the mockup scale.

**Colour**
- Surfaces: `--c-bg-0 #0A0B0E` (footer, sidebar), `--c-bg-1 #0E1014` (page), `--c-bg-2 #14161B`, `--c-bg-3 #1A1D23`, `--c-bg-4 #22262D`.
- Lines: `--c-line rgba(255,255,255,.10)`, soft `.06`, strong `.20`.
- Text: `--c-text #ECEDF0`, `--c-text-2 #A7ABB6`, `--c-text-3 #8D92A0`.
- Accent (single): `--c-accent #4C60C8` fills, `--c-accent-hover #5A6ED3`, `--c-accent-text #9DAAF2` for links and active nav, `--c-on-accent #F7F8FF`, `--c-focus #A9B5F6`.
- Status: ok `#7DC7A3`, warn `#D6B170`, danger text `#E58B8B`, danger fill `#B3424B`.

**Type:** one family, Schibsted Grotesk (fallback Hanken Grotesk, then system-ui). Mixed case, weight 600 for titles, tight tracking (`--ls-hero -.035em`). Scale: micro 12, label 13, sm 14, body 16, md 18, lg 20, h2 20 to 24, h1 28 to 40, title 36 to 60, hero 40 to 72 (fluid via `clamp`). Uppercase is allowed only for 12px micro-labels with `--ls-micro .08em`. Tabular numerals for ratings and numbers.

**Space:** 4/8/16/24/32/48/64/96. Gutter 24 (phone), 32 (768+), 48 (1200+). Max content width 1520.

**Radius:** 4 / 6 / 8 only. No pills except avatar.

**Motion:** ease `cubic-bezier(.16,1,.3,1)`; 150ms (fast), 220ms (medium), 700ms (hero). Only `transform` and `opacity` are animated. Respect `prefers-reduced-motion` (no hero autoplay, no transitions beyond opacity).

## 4. Components

The third column says what builds it. **PrimeNG** means use the PrimeNG component, styled through the preset. **Tailwind** means plain markup with utility classes. **Custom** means a small component of ours (composed from PrimeNG parts where possible). Names are PrimeNG v20 names (`Select`, `Tabs`, `ToggleSwitch` replaced the older `Dropdown`, `TabView`, `InputSwitch`).

| Component | Behavior and look | Built with |
|---|---|---|
| Top nav | Sticky, 64px, hairline bottom. Active item has an accent underline. Search input in the middle-right. | Tailwind layout; search is PrimeNG `IconField` + `InputText`; avatar menu is PrimeNG `Avatar` + `Menu` |
| Hero carousel | Full-bleed backdrop, multi-stop scrim, left column max 560px: title, `★ 8.6 · 2021 · Sci-Fi, Adventure · Movie`, 2-line synopsis, Details + My List. Thin progress bars (not dots) per slide, arrows and pause. Autoplay 7s, pauses on hover, focus and when reduced motion is on. | Custom (`cv-hero`), built from scratch with Tailwind and signals (owner decision) |
| Poster card | 2:3 poster, 4 to 6px radius, hairline inner border, title and year in two quiet lines. Hover: scale 1.02 and brightness lift, no shadow. Add-to-list heart appears on hover or focus (always visible on touch). | Custom (`cv-poster-card`), heart is PrimeNG `Button` |
| Poster row | Heading with quiet "See all", arrow buttons on row hover, horizontal scroll with edge fade, scroll-snap on touch. | PrimeNG `Carousel`; fallback Tailwind scroll-snap container if the Carousel cannot match |
| Genre tile | Tonal field with the genre name, no decorative art. | Tailwind |
| Rating | Single `★ 8.6` with tabular numerals. No star rows. | Custom (`cv-rating`, tiny) |
| Buttons | Rectangular with 6px radius. Primary solid accent, secondary ghost with hairline, destructive uses danger fill only in confirm steps. Control height 44px on touch, 40px on laptop. | PrimeNG `Button` (severity and variant through the preset) |
| Download button | Dashed outline with a muted caption "Hidden in production". Rendered only when the `downloadButton` flag is on. | PrimeNG `Button` (outlined) + Tailwind dashed border |
| Chips and tags | Plain text metadata separated by thin dots. Outlined tags only where interactive (e.g. genre links). | Tailwind (links); PrimeNG `Tag` only if an outlined tag is needed |
| Status | Dot plus text (Active, Blocked, Pending). No coloured pills. | Tailwind |
| Dashboard shell | Sidebar with hairline and a subtle active fill (laptop); bottom tab bar (phone). | Tailwind (navigation links) |
| Tables | Hairline rows, calm density; collapse to stacked rows below 768px. | PrimeNG `Table`; pagination below it is `cv-paginator` |
| Pagination | Prev, up to 5 numbered buttons with ellipses, Next; hairline buttons, active page filled with the accent; hidden when there is one page. | Custom (`cv-paginator`), built from scratch with Tailwind (owner decision) |
| Filters | All / Movies / Series. | PrimeNG `SelectButton` |
| Forms | Visible labels, inline validation, error text under the field, never colour alone. | PrimeNG `InputText`, `Password`, `Select`, `Message`, reactive forms |
| Confirm steps | Delete user, delete account. | PrimeNG `ConfirmPopup` and `Dialog` |
| Seasons | Season panels with episodes. | PrimeNG `Accordion` |
| Cast avatars | Neutral initials, no faces. | PrimeNG `Avatar` |
| Toast | Short, bottom, auto-dismiss 4s, `role="status"`. | PrimeNG `Toast` |
| Skeleton | Flat shimmer blocks matching the final layout. | PrimeNG `Skeleton` |
| Auth card | Card with logo, form, helper links. | PrimeNG `Card` |

## 5. Screens

Home, Browse (grid), Search results, Title (movie and series variants), Favorites (with empty state), Account (profile, password, email, delete account), Admin Users, Admin Overview, Login, Register, Forgot password, Check your email, Verify email result, Reset password, Not found. The mockup covers all of these except Browse, Search results, Verify email result, Reset password and Not found: reuse the poster grid, the auth card and an empty-state block from the mockup for those.

## 6. Responsive rules

Mobile-first. Breakpoints: 768 and 1024 and 1200. Poster width 140 (phone), 160 (768), 176 (1024), 184 (1200). Hero height `clamp(520px, 64vh, 680px)` from 768 up. Dashboard: bottom tabs below 1024, sidebar from 1024. No horizontal page scroll at 360px.

## 7. Accessibility

- Body text 16px, minimum 12px for micro-labels; contrast at least 4.5:1 (token values were chosen for this).
- Visible focus ring (`--c-focus`) on every interactive element; logical tab order; skip link to main content.
- Touch targets at least 44px on phone.
- Poster art always paired with a text title; images have `alt` set to the title and year.
- Carousels and auto-advance can be paused; reduced-motion respected.
- Dialog and confirm steps trap focus and close on Escape; menus are keyboard operable.

## 8. Content rules

- Real copy only, no lorem. Error messages say what happened and what to do next.
- Never show invented numbers. Overview figures come from the API.
- TMDB attribution in the footer of every page.
- Terms and Privacy pages: owner supplies the text; ship placeholders clearly marked until then.
