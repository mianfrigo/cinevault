import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { form, FormField, readonly } from '@angular/forms/signals';
import { RatingModule } from 'primeng/rating';

/** TMDB score: one PrimeNG star next to the number ("8.6"). Renders nothing without a score. */
@Component({
  selector: 'cv-score',
  imports: [RatingModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as t) {
      <span class="inline-flex items-center gap-1 font-medium text-fg tabular-nums">
        <p-rating [formField]="star" [stars]="1" />{{ t }}
      </span>
    }
  `,
})
export class ScoreComponent {
  readonly value = input<number | null>(null);

  // p-rating is a form control: a readonly Signal Forms field fixed at 1 draws one filled star.
  // (formField drives p-rating's readonly from the field state, so [readonly]="true" would be overridden.)
  protected readonly star = form(signal(1), (p) => readonly(p));

  protected readonly text = computed(() => {
    const v = this.value();
    return v != null && Number.isFinite(v) ? v.toFixed(1) : '';
  });
}
