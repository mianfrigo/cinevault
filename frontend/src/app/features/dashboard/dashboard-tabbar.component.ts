import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DashGroup } from './dashboard-nav';

/** The phone tab bar has no group headings: every item in one row (five tabs with Site fit 390px at 44px). */
@Component({
  selector: 'cv-dashboard-tabbar',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <nav
      aria-label="Dashboard (small screens)"
      class="fixed inset-x-0 bottom-0 z-95 grid h-15 grid-flow-col auto-cols-fr border-t border-line-soft bg-surface-0 box-content pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      @for (item of items(); track item.path) {
        <a
          [routerLink]="item.path"
          class="flex min-h-11 flex-col items-center justify-center gap-1 text-micro font-medium transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4 not-aria-[current=page]:text-fg-3"
          routerLinkActive="text-accent-text"
          ariaCurrentWhenActive="page"
        >
          <i [class]="item.icon" aria-hidden="true"></i>
          {{ item.label }}
        </a>
      }
      <a
        routerLink="/"
        class="flex min-h-11 flex-col items-center justify-center gap-1 text-micro font-medium text-fg-3 transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4"
      >
        <i class="pi pi-home" aria-hidden="true"></i>
        Site
      </a>
    </nav>
  `,
})
export class DashboardTabbarComponent {
  readonly groups = input.required<DashGroup[]>();

  protected readonly items = computed(() => this.groups().flatMap((g) => g.items));
}
