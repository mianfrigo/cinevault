import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** One art variant per auth intent: a scene (sun over water, or waves and a circle) in one tone. */
export type AuthArtVariant = 'login' | 'register' | 'recover' | 'verify';

interface Look {
  scene: 'sun' | 'waves';
  tone: 'sage' | 'clay' | 'teal' | 'slate';
  /** Large caption on the art panel (mockup copy). Decorative: never the page heading. */
  tagline: string;
}

export const AUTH_ART: Record<AuthArtVariant, Look> = {
  login: { scene: 'sun', tone: 'sage', tagline: 'Your list, on every screen.' },
  register: { scene: 'sun', tone: 'clay', tagline: 'Save it now. Watch it later.' },
  recover: { scene: 'waves', tone: 'teal', tagline: 'Locked out? It happens.' },
  verify: { scene: 'waves', tone: 'slate', tagline: 'One click and you are in.' },
};

/**
 * Flat key art of the mockup (procedural "horizon" and "dunes" motifs, drawn at 900 x 1100 with the
 * focal point at 62%). Colours come from the theme tone tokens through three custom properties, so
 * one drawing serves every tone. Decorative: the host is aria-hidden by the layout.
 */
@Component({
  selector: 'cv-auth-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-0 block' },
  template: `
    <svg
      class="size-full"
      viewBox="0 0 900 1100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      [style]="colours()"
    >
      <defs>
        <filter id="cv-auth-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency=".85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0" intercept="1" />
          </feComponentTransfer>
        </filter>
        <clipPath id="cv-auth-sky"><rect width="900" height="726" /></clipPath>
      </defs>
      <rect width="900" height="1100" fill="var(--art-a)" />
      @if (look().scene === 'sun') {
        <polygon points="522,0 774,0 450,726 198,726" fill="var(--art-c)" opacity=".06" />
        <rect y="726" width="900" height="374" fill="var(--art-b)" />
        <circle cx="558" cy="769" r="216" fill="var(--art-c)" clip-path="url(#cv-auth-sky)" />
        <rect x="381" y="757.5" width="354" height="5.7" fill="var(--art-c)" opacity=".51" />
        <rect x="420" y="789" width="276" height="5.7" fill="var(--art-c)" opacity=".4" />
        <rect x="459" y="820.5" width="199" height="5.7" fill="var(--art-c)" opacity=".29" />
        <rect x="497.5" y="852" width="121" height="5.7" fill="var(--art-c)" opacity=".18" />
        <rect y="726" width="900" height="4" fill="var(--art-c)" opacity=".55" />
      } @else {
        <circle cx="558" cy="363" r="67.5" fill="var(--art-c)" />
        <path
          d="M0 616C252 572 468 660 702 598.4S900 616 900 616V1100H0Z"
          fill="var(--art-b)"
          opacity=".45"
        />
        <path
          d="M0 726C252 671 468 781 702 704S900 726 900 726V1100H0Z"
          fill="var(--art-b)"
          opacity=".8"
        />
        <path d="M0 858C252 803 468 913 702 836S900 858 900 858V1100H0Z" fill="var(--art-b)" />
        <path
          d="M0 858C252 803 468 913 702 836S900 858 900 858V1100H0Z"
          fill="var(--color-surface-0)"
          opacity=".3"
        />
      }
      <rect
        width="900"
        height="1100"
        fill="var(--color-fg-3)"
        filter="url(#cv-auth-grain)"
        opacity=".07"
      />
    </svg>
    <!-- Caption scrim (mockup .auth-art::after): ink rises from the bottom so the tagline stays legible. -->
    <svg class="absolute inset-0 size-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="cv-auth-scrim" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="var(--color-surface-1)" stop-opacity=".92" />
          <stop offset=".3" stop-color="var(--color-surface-1)" stop-opacity=".5" />
          <stop offset=".6" stop-color="var(--color-surface-1)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#cv-auth-scrim)" />
    </svg>
  `,
})
export class AuthArtComponent {
  readonly variant = input.required<AuthArtVariant>();

  protected readonly look = computed(() => AUTH_ART[this.variant()]);
  protected readonly colours = computed(() => {
    const tone = this.look().tone;
    return {
      '--art-a': `var(--color-tone-${tone}-ground)`,
      '--art-b': `var(--color-tone-${tone})`,
      '--art-c': `var(--color-tone-${tone}-light)`,
    };
  });
}
