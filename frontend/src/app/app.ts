import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from './shell/footer.component';
import { NavComponent } from './shell/nav.component';

@Component({
  selector: 'cv-root',
  imports: [RouterOutlet, NavComponent, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <a class="skip-link" href="#main">Skip to main content</a>
    <cv-nav />
    <main id="main" tabindex="-1" class="flex-1">
      <router-outlet />
    </main>
    <cv-footer />
  `,
})
export class App {}
