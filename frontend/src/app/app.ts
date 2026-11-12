import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  NavigationCancel,
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
   * The auth pages (route data `chromeless`) draw their own page: no nav, no footer. The first frame is
   * already right: before the router has navigated (the lazy page is still loading) the address bar names
   * the page, so the top-level route it matches decides. Every navigation outcome then resyncs.
   */
  protected readonly chromeless = signal(
    this.router.config.some(
      (r) => r.data?.['chromeless'] && r.path === this.location.path().split(/[?#]/)[0].slice(1),
    ),
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
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.chromeless.set(route.data['chromeless'] === true);
    });
  }
}
