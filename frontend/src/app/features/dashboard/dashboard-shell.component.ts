import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from '@core/auth/auth.store';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { TmdbCreditComponent } from '@shared/components/tmdb-credit/tmdb-credit.component';
import { plural } from '@shared/utils/plural';
import { DashGroup } from './dashboard-nav';
import { DashboardSidebarComponent } from './dashboard-sidebar.component';
import { DashboardTabbarComponent } from './dashboard-tabbar.component';
import { DashboardTopbarComponent } from './dashboard-topbar.component';

/**
 * Frame of every /dashboard and /admin page: the app chrome is off here, so this draws the whole page.
 * From 1024px a full-height sidebar (logo, items, back to site, log out, user); below it a slim top bar and
 * a bottom tab bar. The items come from `groups`: an administrator gets a second group, Admin (Users,
 * Overview), which a member never sees. The TMDB credit sits quietly at the foot of the main column.
 */
@Component({
  selector: 'cv-dashboard-shell',
  imports: [
    RouterOutlet,
    DashboardSidebarComponent,
    DashboardTabbarComponent,
    DashboardTopbarComponent,
    TmdbCreditComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]' },
  template: `
    <cv-dashboard-sidebar [groups]="groups()" />

    <div class="flex min-h-dvh min-w-0 flex-col">
      <cv-dashboard-topbar />

      <div class="flex-1 px-6 pt-6 pb-8 md:px-8 lg:px-12 lg:pt-12 xl:px-16">
        <router-outlet />
      </div>

      <!-- The sentence TMDB requires on every page (mockup .foot-fine). pb clears the fixed tab bar on a phone. -->
      <footer class="px-6 pb-24 md:px-8 lg:px-12 lg:pb-12 xl:px-16">
        <cv-tmdb-credit class="max-w-[80ch] border-t border-line-soft pt-4 text-label text-fg-3" />
      </footer>
    </div>

    <cv-dashboard-tabbar [groups]="groups()" />
  `,
})
export default class DashboardShell {
  private readonly auth = inject(AuthStore);
  private readonly favorites = inject(FavoritesStore);

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
            countLabel: `saved ${plural(saved ?? 0, 'title')}`,
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
}
