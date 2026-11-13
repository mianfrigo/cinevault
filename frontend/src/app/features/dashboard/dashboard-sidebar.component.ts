import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AuthStore } from '@core/auth/auth.store';
import { injectLogout } from '@core/auth/logout';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { initials } from '@shared/utils/initials';
import { DashGroup } from './dashboard-nav';

/** Link and row look shared by the sidebar items (mockup .sb-link): 44px targets, active = filled pill. */
const SIDE_LINK =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-hover hover:text-fg [&>i]:text-base not-aria-[current=page]:text-fg-2';

/**
 * The full-height sidebar from 1024px: logo, the groups of items, back to site, log out and the user.
 * Its host leaves no box of its own, so the aside stays the shell grid item.
 */
@Component({
  selector: 'cv-dashboard-sidebar',
  imports: [RouterLink, RouterLinkActive, AvatarModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <aside
      aria-label="Dashboard"
      class="hidden border-r border-line-soft bg-surface-0 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start lg:px-4 lg:py-6"
    >
      <cv-logo class="mb-7 px-3" />
      <nav aria-label="Dashboard sections" class="grid gap-0.5">
        @for (group of groups(); track $index) {
          <div
            [attr.role]="group.label ? 'group' : null"
            [attr.aria-labelledby]="group.label ? 'dash-group-' + $index : null"
            class="grid gap-0.5"
          >
            @if (group.label) {
              <p
                [id]="'dash-group-' + $index"
                class="mt-4 mb-1 px-3 text-micro font-medium tracking-micro text-fg-3 uppercase"
              >
                {{ group.label }}
              </p>
            }
            @for (item of group.items; track item.path) {
              <a
                [routerLink]="item.path"
                [class]="sideLink"
                routerLinkActive="bg-hover-2 text-fg [&>i]:text-accent-text"
                ariaCurrentWhenActive="page"
              >
                <i [class]="item.icon" aria-hidden="true"></i>
                {{ item.label }}
                @if (item.count !== undefined) {
                  <span class="ml-auto text-label font-normal text-fg-3 tabular-nums">
                    <span aria-hidden="true">{{ item.count }}</span>
                    <span class="sr-only">, {{ item.count }} {{ item.countLabel }}</span>
                  </span>
                }
              </a>
            }
          </div>
        }
      </nav>
      <div class="mt-auto grid gap-0.5 border-t border-line-soft pt-4">
        <a routerLink="/" [class]="sideLink">
          <i class="pi pi-arrow-left" aria-hidden="true"></i>
          Back to site
        </a>
        <button type="button" [class]="sideLink" (click)="logout()">
          <i class="pi pi-sign-out" aria-hidden="true"></i>
          Log out
        </button>
        @if (user(); as user) {
          <div class="flex items-center gap-3 px-3 pt-4">
            <p-avatar [label]="user.initials" shape="circle" aria-hidden="true" />
            <div class="min-w-0">
              <b class="block truncate text-sm leading-tight font-medium">{{ user.name }}</b>
              <small class="text-label text-fg-3">{{ user.role }}</small>
            </div>
          </div>
        }
      </div>
    </aside>
  `,
})
export class DashboardSidebarComponent {
  readonly groups = input.required<DashGroup[]>();

  private readonly auth = inject(AuthStore);
  protected readonly logout = injectLogout();
  protected readonly sideLink = SIDE_LINK;

  protected readonly user = computed(() => {
    const user = this.auth.user();
    if (!user) return null;
    return {
      name: user.name,
      initials: initials(user.name, 'A'),
      role: user.role === 'ADMIN' ? 'Administrator' : 'Member',
    };
  });
}
