import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@core/auth/auth.store';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { initials } from '@shared/utils/initials';
import { LogoComponent } from '@shared/components/logo/logo.component';

interface DashGroup {
  /** Heading of the group (sidebar only); the first group has none. */
  label?: string;
  items: DashItem[];
}

interface DashItem {
  label: string;
  path: string;
  icon: string;
  /** A quiet number at the end of the row (sidebar only); undefined while it is not known. */
  count?: number;
  /** What the number counts, read out after the label: "11 saved titles". */
  countLabel?: string;
}

/** Link and row look shared by the sidebar items (mockup .sb-link): 44px targets, active = filled pill. */
const SIDE_LINK =
  'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors duration-150 hover:bg-hover hover:text-fg [&>i]:text-base not-aria-[current=page]:text-fg-2';

/**
 * Frame of every /dashboard and /admin page: the app chrome is off here, so this draws the whole page.
 * From 1024px a full-height sidebar (logo, items, back to site, log out, user); below it a slim top bar and
 * a bottom tab bar. The items come from `groups`: an administrator gets a second group, Admin (Users,
 * Overview), which a member never sees. The TMDB credit sits quietly at the foot of the main column.
 */
@Component({
  selector: 'cv-dashboard-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AvatarModule, ButtonModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]' },
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
        @if (auth.user(); as user) {
          <div class="flex items-center gap-3 px-3 pt-4">
            <p-avatar [label]="initials(user.name, 'A')" shape="circle" aria-hidden="true" />
            <div class="min-w-0">
              <b class="block truncate text-sm leading-tight font-medium">{{ user.name }}</b>
              <small class="text-label text-fg-3">{{ roleLabel() }}</small>
            </div>
          </div>
        }
      </div>
    </aside>

    <div class="flex min-h-dvh min-w-0 flex-col">
      <!-- Phone and tablet: the sidebar's logo and Log out live in a slim top bar. -->
      <header
        class="sticky top-0 z-90 flex h-14 items-center justify-between border-b border-line-soft bg-surface-1/90 px-6 backdrop-blur-md md:px-8 lg:hidden"
      >
        <cv-logo />
        <p-button
          class="-mr-2.5"
          icon="pi pi-sign-out"
          [text]="true"
          severity="secondary"
          ariaLabel="Log out"
          (onClick)="logout()"
        />
      </header>

      <div class="flex-1 px-6 pt-6 pb-8 md:px-8 lg:px-12 lg:pt-12 xl:px-16">
        <router-outlet />
      </div>

      <!-- The sentence TMDB requires on every page (mockup .foot-fine). pb clears the fixed tab bar on a phone. -->
      <footer class="px-6 pb-24 md:px-8 lg:px-12 lg:pb-12 xl:px-16">
        <p class="max-w-[80ch] border-t border-line-soft pt-4 text-label text-fg-3">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </footer>
    </div>

    <nav
      aria-label="Dashboard (small screens)"
      class="fixed inset-x-0 bottom-0 z-95 grid h-15 grid-flow-col auto-cols-fr border-t border-line-soft bg-surface-0 box-content pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      @for (item of allItems(); track item.path) {
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
export default class DashboardShell {
  protected readonly auth = inject(AuthStore);
  private readonly favorites = inject(FavoritesStore);
  private readonly router = inject(Router);

  protected readonly sideLink = SIDE_LINK;
  protected readonly initials = initials;
  protected readonly roleLabel = computed(() =>
    this.auth.user()?.role === 'ADMIN' ? 'Administrator' : 'Member',
  );

  protected readonly groups = computed<DashGroup[]>(() => {
    const saved = this.favorites.counts()?.all;
    const groups: DashGroup[] = [
      {
        items: [
          {
            label: 'Favorites',
            path: '/dashboard/favorites',
            icon: 'pi pi-heart',
            count: saved,
            countLabel: saved === 1 ? 'saved title' : 'saved titles',
          },
          { label: 'Account', path: '/dashboard/account', icon: 'pi pi-user' },
        ],
      },
    ];
    if (this.auth.isAdmin()) {
      groups.push({
        label: 'Admin',
        items: [
          { label: 'Users', path: '/admin/users', icon: 'pi pi-users' },
          { label: 'Overview', path: '/admin/overview', icon: 'pi pi-chart-bar' },
        ],
      });
    }
    return groups;
  });

  /** The phone tab bar has no group headings: every item in one row (five tabs with Site fit 390px at 44px). */
  protected readonly allItems = computed(() => this.groups().flatMap((g) => g.items));

  /** Leaves first: a page that still holds work (a pending removal) sends it while the session is valid. */
  protected async logout(): Promise<void> {
    // A navigation that fails (a lazy chunk that cannot load) must not keep the user logged in.
    await this.router.navigateByUrl('/').catch(() => undefined);
    await this.auth.logout();
  }
}
