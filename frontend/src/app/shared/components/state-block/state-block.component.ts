import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { ResponseStatus } from '@core/ssr/response-status.service';

@Component({
  selector: 'cv-state',
  imports: [ButtonModule, MessageModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (kind()) {
      @case ('loading') {
        <div role="status" aria-busy="true" class="grid gap-3">
          <span class="sr-only">Loading</span>
          <p-skeleton height="12rem" />
          <p-skeleton width="60%" height="1rem" />
          <p-skeleton width="40%" height="1rem" />
        </div>
      }
      @case ('empty') {
        <p class="py-12 text-center text-sm text-fg-2">{{ message() ?? 'Nothing here yet.' }}</p>
      }
      @case ('error') {
        <div role="alert" class="grid justify-items-start gap-3">
          <p-message severity="error">
            {{ message() ?? 'Something went wrong. Check your connection and try again.' }}
          </p-message>
          <p-button
            label="Retry"
            severity="secondary"
            variant="outlined"
            (onClick)="retry.emit()"
          />
        </div>
      }
    }
  `,
})
export class StateBlockComponent {
  readonly kind = input.required<'loading' | 'empty' | 'error'>();
  readonly message = input<string>();
  readonly retry = output<void>();

  constructor() {
    // A page that renders its error state (the API or TMDB is down) must not be cached as if it were fine.
    const response = inject(ResponseStatus);
    effect(() => {
      if (this.kind() === 'error') response.set(503);
    });
  }
}
