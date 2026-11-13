import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  Router,
  RouterOutlet,
} from '@angular/router';
import { Toast } from 'primeng/toast';
import { FooterComponent } from './shell/footer.component';
import { NavComponent } from './shell/nav.component';

@Component({
  selector: 'cv-root',
  imports: [RouterOutlet, Toast, NavComponent, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <a class="skip-link" href="#main">Skip to main content</a>
    @if (!chromeless()) {
      <cv-nav />
    }
    <main id="main" tabindex="-1" class="flex-1">
      <router-outlet />
    </main>
    @if (!chromeless()) {
      <cv-footer />
    }
    <!-- The one toast host: any page shows a message through MessageService (provided in app.config).
         Deferred so PrimeNG Toast stays out of the initial bundle; it loads right after bootstrap. -->
    @defer (on immediate) {
      <p-toast position="bottom-center" />
    }
  `,
})
export class App {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /**
   * The auth pages and the dashboard (route data `chromeless`) draw their own page: no nav, no footer. The
   * first frame is already right: before the router has navigated (the lazy page is still loading) the
   * address bar names the page, so the top-level route it falls under decides (the route itself or any
   * path below it, so `dashboard` covers `dashboard/favorites`). Every navigation outcome then resyncs.
   */
  protected readonly chromeless = signal(
    this.router.config.some((r) => {
      if (!r.data?.['chromeless'] || !r.path) return false;
      const path = this.location.path().split(/[?#]/)[0].slice(1);
      return path === r.path || path.startsWith(r.path + '/');
    }),
  );

  constructor() {
    // The root component lives as long as the app, so the subscription needs no teardown. A cancelled or
    // failed navigation resyncs too: whatever is activated (nothing, on a failed first load) decides.
    this.router.events.subscribe((e) => {
      if (!(
        e instanceof NavigationEnd ||
        e instanceof NavigationCancel ||
        e instanceof NavigationError
      ))
        return;
      // Any activated route of the chain may carry the flag: a parent's data is not inherited by its
      // children when the parent has a component (the dashboard shell), so the whole chain is read.
      // A guard redirect (a logged out visit to the dashboard) cancels the navigation only to start the next
      // one: nothing is activated in between, so resyncing here would draw the nav and footer for a frame.
      if (e instanceof NavigationCancel && e.code === NavigationCancellationCode.Redirect) return;
      let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
      let flagged = false;
      for (; route && !flagged; route = route.firstChild)
        flagged = route.data['chromeless'] === true;
      this.chromeless.set(flagged);
    });
  }
}
