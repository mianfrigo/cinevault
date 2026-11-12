import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { AUTH_ART, AuthArtComponent, AuthArtVariant } from './auth-art.component';

/**
 * Chromeless split layout of every auth page (the app shell hides its nav and footer on these
 * routes): a decorative art panel on the left from 1024px up, and the form column with the logo, a
 * back link, the heading, the page content and the TMDB credit. Below 1024px only the form column
 * remains. The page owns the single h1 (`heading`); the tagline on the art is decorative.
 */
@Component({
  selector: 'cv-auth-layout',
  imports: [RouterLink, LogoComponent, AuthArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Controls are 44px here on every width (the preset drops them to 40px from 1024px; the input token is already resolved at :root). Inline: a utility per
  // custom property would add CSS to the initial stylesheet for two rules only this layout needs.
  host: {
    class: 'grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]',
    style: '--p-button-padding-y:0.65625rem;--p-inputtext-padding-y:0.5625rem',
  },
  template: `
    <div
      class="relative isolate hidden items-end overflow-hidden bg-surface-0 p-12 lg:flex"
      aria-hidden="true"
    >
      <cv-auth-art [variant]="art()" />
      <p class="relative max-w-[14ch] text-title font-semibold text-fg">
        {{ tagline() }}
      </p>
    </div>
    <div class="flex min-w-0 flex-col px-6 pt-4 pb-6 md:px-8 lg:px-16">
      <div class="flex items-center justify-between gap-4">
        <div class="[&_a]:min-h-11"><cv-logo /></div>
        <a
          [routerLink]="back() === 'login' ? '/login' : '/'"
          class="inline-flex min-h-11 items-center font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >{{ back() === 'login' ? 'Back to log in' : 'Back to site' }}</a
        >
      </div>
      <div class="m-auto w-full max-w-100 py-8 motion-safe:animate-hero-rise">
        @if (mail()) {
          <span
            class="mb-6 grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface-2 text-fg-2"
            aria-hidden="true"
          >
            <svg
              width="20"
              height="20"
              class="fill-none stroke-current"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3.5 7.5l8.5 6 8.5-6" />
            </svg>
          </span>
        }
        <h1 class="text-h1 text-fg">{{ heading() }}</h1>
        @if (lead()) {
          <p class="mt-3 max-w-[44ch] text-fg-2">{{ lead() }}</p>
        }
        <ng-content select="[slot=lead]" />
        <div class="mt-6 grid gap-4">
          <ng-content />
        </div>
      </div>
      <p class="max-w-[60ch] text-label text-fg-3">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly heading = input.required<string>();
  readonly lead = input<string>();
  /** Picks the art scene, its tone and the tagline. */
  readonly art = input.required<AuthArtVariant>();
  /** The top-right link: the site home, or the log in page on the password recovery pages. */
  readonly back = input<'site' | 'login'>('site');
  /** A mail icon above the heading (check your inbox / check your email). */
  readonly mail = input(false);

  protected readonly tagline = computed(() => AUTH_ART[this.art()].tagline);
}
