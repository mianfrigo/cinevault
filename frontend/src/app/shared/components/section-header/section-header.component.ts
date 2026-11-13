import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * A section's h2 with, at its end, whatever the caller projects (the row's scroll arrows, a link) and
 * an optional "See all" link. The space below is the caller's (a `mb-*` class on the host).
 */
@Component({
  selector: 'cv-section-header',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-center justify-between gap-4">
      <h2 [attr.id]="headingId()" class="section-title">{{ heading() }}</h2>
      <div class="flex items-center gap-2">
        <ng-content />
        @if (link(); as to) {
          <a
            [routerLink]="to"
            class="inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-fg lg:min-h-10"
            >{{ linkLabel() }}<i class="pi pi-angle-right" aria-hidden="true"></i
          ></a>
        }
      </div>
    </div>
  `,
})
export class SectionHeaderComponent {
  readonly heading = input.required<string>();
  /** The id of the h2, for an `aria-labelledby` on the section. */
  readonly headingId = input<string>();
  /** Router link of the "See all" link at the end; none renders no link. */
  readonly link = input<string | unknown[]>();
  readonly linkLabel = input('See all');
}
