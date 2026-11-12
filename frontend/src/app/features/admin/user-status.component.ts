import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { UserStatus } from '@core/models';

const LOOK: Record<UserStatus, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-ok' },
  BLOCKED: { label: 'Blocked', dot: 'bg-danger' },
  PENDING: { label: 'Pending', dot: 'bg-warn' },
};

/** Account status as a dot plus its name (mockup .st): the word carries the meaning, never the colour alone. */
@Component({
  selector: 'cv-user-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-2 text-sm leading-5 whitespace-nowrap text-fg-2">
      <i class="size-1.5 flex-none rounded-full" [class]="look().dot" aria-hidden="true"></i>
      {{ look().label }}
    </span>
  `,
})
export class UserStatusComponent {
  readonly status = input.required<UserStatus>();
  protected readonly look = computed(() => LOOK[this.status()]);
}
