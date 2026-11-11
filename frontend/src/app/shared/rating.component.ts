import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'cv-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (formatted(); as text) {
      <span class="inline-flex items-center font-medium text-fg tabular-nums">★ {{ text }}</span>
    }
  `,
})
export class RatingComponent {
  readonly value = input<number | null>(null);

  /** Empty string (renders nothing) for null, undefined and non-finite values. */
  protected formatted(): string {
    const v = this.value();
    return v != null && Number.isFinite(v) ? v.toFixed(1) : '';
  }
}
