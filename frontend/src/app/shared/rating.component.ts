import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'cv-rating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value() !== null) {
      <span class="inline-flex items-center font-medium text-fg tabular-nums"
        >★ {{ formatted() }}</span
      >
    }
  `,
})
export class RatingComponent {
  readonly value = input<number | null>(null);

  protected formatted(): string {
    return (this.value() ?? 0).toFixed(1);
  }
}
