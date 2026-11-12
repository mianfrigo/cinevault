import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardModule } from 'primeng/card';
import { LogoComponent } from '../../shell/logo.component';

/** Shared layout of every auth page: a centred card with the logo, a heading and an optional lead line. */
@Component({
  selector: 'cv-auth-card',
  imports: [CardModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto flex max-w-site justify-center px-6 py-12 md:py-20">
      <p-card class="w-full max-w-md">
        <cv-logo />
        <h1 class="mt-6 text-h1 text-fg">{{ heading() }}</h1>
        @if (lead()) {
          <p class="mt-3 text-fg-2">{{ lead() }}</p>
        }
        <div class="mt-6 grid gap-4">
          <ng-content />
        </div>
      </p-card>
    </section>
  `,
})
export class AuthCardComponent {
  readonly heading = input.required<string>();
  readonly lead = input<string>();
}
