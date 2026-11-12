import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
    <cv-nav />
    <main id="main" tabindex="-1" class="flex-1">
      <router-outlet />
    </main>
    <cv-footer />
    <!-- The one toast host: any page shows a message through MessageService (provided in app.config).
         Deferred so PrimeNG Toast stays out of the initial bundle; it loads right after bootstrap. -->
    @defer (on immediate) {
      <p-toast position="bottom-center" />
    }
  `,
})
export class App {}
