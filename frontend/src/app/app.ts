import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
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
  /** Routes marked `data: { chromeless: true }` (the auth pages) draw their own page: no nav, no footer. */
  protected readonly chromeless = signal(false);

  constructor() {
    const router = inject(Router);
    // The root component lives as long as the app, so the subscription needs no teardown.
    router.events.subscribe((e) => {
      if (!(e instanceof NavigationEnd)) return;
      let route = router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.chromeless.set(route.data['chromeless'] === true);
    });
  }
}
