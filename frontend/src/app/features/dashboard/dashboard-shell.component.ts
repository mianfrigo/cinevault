import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { AuthStore } from '../../core/auth/auth.store';

interface DashItem {
  label: string;
  path: string;
  icon: string;
}

/**
 * Frame of every /dashboard page: a sidebar from 1024px, a bottom tab bar below it. The items come
 * from `items`, so the admin pages (Users, Overview) join it by adding entries there.
 */
@Component({
  selector: 'cv-dashboard-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AvatarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto max-w-site lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside
        class="hidden border-r border-line-soft bg-surface-0 lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:px-3 lg:py-4"
      >
        <nav aria-label="Dashboard sections" class="grid gap-0.5">
          @for (item of items(); track item.path) {
            <a
              [routerLink]="item.path"
              [class]="sideLink"
              routerLinkActive="bg-hover-2 text-fg [&>i]:text-accent-text"
              ariaCurrentWhenActive="page"
            >
              <i [class]="item.icon" aria-hidden="true"></i>
              {{ item.label }}
            </a>
          }
        </nav>
        <div class="mt-auto grid gap-0.5 border-t border-line-soft pt-3">
          <a routerLink="/" [class]="sideLink">
            <i class="pi pi-arrow-left" aria-hidden="true"></i>
            Back to site
          </a>
          <button type="button" [class]="sideLink" (click)="logout()">
            <i class="pi pi-sign-out" aria-hidden="true"></i>
            Log out
          </button>
          @if (auth.user(); as user) {
            <div class="flex items-center gap-3 px-3 pt-3">
              <p-avatar
                [label]="user.name.charAt(0).toUpperCase()"
                shape="circle"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <b class="block truncate text-sm font-medium">{{ user.name }}</b>
                <small class="text-label text-fg-3">{{
                  user.role === 'ADMIN' ? 'Administrator' : 'Member'
                }}</small>
              </div>
            </div>
          }
        </div>
      </aside>

      <div class="min-w-0 px-6 py-6 md:px-8 lg:px-8 lg:py-8 xl:px-12">
        <router-outlet />
      </div>

      <!-- Phone and tablet: sticky at the bottom of the viewport while the dashboard is on screen, so the footer stays reachable. -->
      <nav
        aria-label="Dashboard (small screens)"
        class="sticky bottom-0 z-95 grid grid-flow-col auto-cols-fr border-t border-line-soft bg-surface-0 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        @for (item of items(); track item.path) {
          <a
            [routerLink]="item.path"
            class="flex min-h-14 flex-col items-center justify-center gap-1 text-micro font-medium transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4 not-aria-[current=page]:text-fg-3"
            routerLinkActive="text-accent-text"
            ariaCurrentWhenActive="page"
          >
            <i [class]="item.icon" aria-hidden="true"></i>
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
  `,
})
export default class DashboardShell {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly sideLink =
    'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-hover hover:text-fg [&>i]:text-base not-aria-[current=page]:text-fg-2';

  // Task 19 adds Users and Overview here for admins (`this.auth.isAdmin()`).
  protected readonly items = computed<DashItem[]>(() => [
    { label: 'Favorites', path: '/dashboard/favorites', icon: 'pi pi-heart' },
    { label: 'Account', path: '/dashboard/account', icon: 'pi pi-user' },
  ]);

  /** Leaves first: a page that still holds work (a pending removal) sends it while the session is valid. */
  protected async logout(): Promise<void> {
    // A navigation that fails (a lazy chunk that cannot load) must not keep the user logged in.
    await this.router.navigateByUrl('/').catch(() => undefined);
    await this.auth.logout();
  }
}
