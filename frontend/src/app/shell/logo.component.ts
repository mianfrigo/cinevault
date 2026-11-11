import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'cv-logo',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      routerLink="/"
      aria-label="Cinevault, home"
      class="inline-flex flex-none items-center gap-2 rounded-sm text-fg"
    >
      <svg
        class="size-6 fill-none stroke-current"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 21V12a8 8 0 0 1 16 0v9" />
        <path d="M9 21v-8a3 3 0 0 1 6 0v8" />
      </svg>
      <span class="text-lg leading-none font-semibold tracking-[-0.03em]">Cinevault</span>
    </a>
  `,
})
export class LogoComponent {}
