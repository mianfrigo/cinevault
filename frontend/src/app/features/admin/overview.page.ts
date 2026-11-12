import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AvatarModule } from 'primeng/avatar';
import { SkeletonModule } from 'primeng/skeleton';
import { ApiClient } from '@core/api/api-client';
import { AuthStore } from '@core/auth/auth.store';
import { AdminOverview } from '@core/models';
import { initials } from '@shared/utils/initials';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { UserStatusComponent } from './user-status.component';

/**
 * /admin/overview: two quiet key figures and the latest sign-ups. Nothing user specific renders on the
 * server (no session there): the page stays on its skeleton until the browser has a logged in admin.
 */
@Component({
  selector: 'cv-overview-page',
  imports: [
    DatePipe,
    RouterLink,
    AvatarModule,
    SkeletonModule,
    StateBlockComponent,
    UserStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-8">
      <h1 class="text-h1 text-fg">Overview</h1>
      <p class="mt-2 text-sm text-fg-3">A quick read on who is using Cinevault.</p>
    </header>

    @if (overview.error()) {
      <cv-state
        kind="error"
        message="Could not load the overview. Check your connection and try again."
        (retry)="overview.reload()"
      />
    } @else if (overview.hasValue()) {
      @let data = overview.value();
      <!-- Quiet key figures (mockup .figs): two numbers between hairlines, not a metric hero. -->
      <dl class="mb-12 grid grid-cols-2 border-y border-line-soft lg:max-w-160">
        <div class="py-4">
          <dt class="text-sm text-fg-2">Total users</dt>
          <dd class="mt-2 text-h1 leading-[1.1] font-semibold tabular-nums">
            {{ data.totalUsers }}
          </dd>
          <dd class="mt-1 text-label text-fg-3">Verified and unverified accounts.</dd>
        </div>
        <div class="border-l border-line-soft py-4 pl-4">
          <dt class="text-sm text-fg-2">New this week</dt>
          <dd class="mt-2 text-h1 leading-[1.1] font-semibold tabular-nums">
            {{ data.newThisWeek }}
          </dd>
          <dd class="mt-1 text-label text-fg-3">Created in the last 7 days.</dd>
        </div>
      </dl>

      <section aria-labelledby="h-recent" class="lg:max-w-190">
        <div class="mb-2 flex items-center justify-between">
          <h2 id="h-recent" class="text-h2 text-fg">Recent signups</h2>
          <a
            routerLink="/admin/users"
            class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg"
          >
            View all users
            <i class="pi pi-angle-right" aria-hidden="true"></i>
          </a>
        </div>
        @if (data.recentSignups.length === 0) {
          <p class="border-y border-line-soft py-6 text-sm text-fg-2">No one has signed up yet.</p>
        } @else {
          <ul>
            @for (user of data.recentSignups; track user.id) {
              <li class="flex items-center gap-3 border-t border-line-soft py-3 last:border-b">
                <p-avatar [label]="initials(user.name)" shape="circle" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <b class="block truncate leading-[1.3] font-medium">{{ user.name }}</b>
                  <small class="block truncate text-label text-fg-3">{{ user.email }}</small>
                </div>
                <cv-user-status class="max-sm:hidden sm:min-w-24" [status]="user.status" />
                <time
                  class="min-w-21 text-right text-label leading-5 whitespace-nowrap text-fg-3"
                  [attr.datetime]="user.createdAt"
                  >{{ user.createdAt | date: 'd MMM y' : 'UTC' }}</time
                >
              </li>
            }
          </ul>
        }
      </section>
    } @else {
      <div role="status" aria-busy="true">
        <span class="sr-only">Loading</span>
        <div aria-hidden="true">
          <div class="mb-12 grid grid-cols-2 border-y border-line-soft py-4 lg:max-w-160">
            <div class="grid gap-2">
              <p-skeleton width="5rem" height="0.875rem" />
              <p-skeleton width="4rem" height="2.5rem" />
              <p-skeleton width="10rem" height="0.8125rem" />
            </div>
            <div class="grid gap-2 border-l border-line-soft pl-4">
              <p-skeleton width="6rem" height="0.875rem" />
              <p-skeleton width="3rem" height="2.5rem" />
              <p-skeleton width="9rem" height="0.8125rem" />
            </div>
          </div>
          <div class="lg:max-w-190">
            <p-skeleton class="mb-4 block" width="9rem" height="1.5rem" />
            @for (n of [1, 2, 3, 4, 5]; track n) {
              <div class="flex h-[3.8125rem] items-center gap-3 border-t border-line-soft">
                <p-skeleton shape="circle" size="2.25rem" />
                <div class="grid flex-1 gap-1.5">
                  <p-skeleton width="30%" height="0.875rem" />
                  <p-skeleton width="45%" height="0.8125rem" />
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export default class OverviewPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthStore);

  protected readonly initials = initials;

  // `params` is undefined without a session (the server, or a visitor mid logout): the resource stays idle.
  protected readonly overview = rxResource({
    params: () => (this.auth.isLoggedIn() ? true : undefined),
    stream: () => this.api.get<AdminOverview>('/admin/overview'),
  });
}
