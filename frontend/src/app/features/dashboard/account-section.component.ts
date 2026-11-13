import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One block of the account page: heading and description on the left (above on a phone), the content on the right. */
@Component({
  selector: 'cv-account-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'grid gap-6 border-t border-line-soft py-8 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:gap-12',
    role: 'group',
    '[attr.aria-labelledby]': 'headingId()',
  },
  template: `
    <div>
      <h2 [id]="headingId()" class="section-title">{{ heading() }}</h2>
      <p class="mt-2 max-w-[34ch] text-sm text-fg-3">{{ description() }}</p>
    </div>
    <div class="grid max-w-110 content-start gap-4">
      <ng-content />
    </div>
  `,
})
export class AccountSectionComponent {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly description = input.required<string>();
}
