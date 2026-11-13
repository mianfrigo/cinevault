import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { injectLogout } from '@core/auth/logout';
import { LogoComponent } from '@shared/components/logo/logo.component';

/** Phone and tablet: the logo and Log out of the sidebar live in a slim top bar (hidden from 1024px). */
@Component({
  selector: 'cv-dashboard-topbar',
  imports: [ButtonModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
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
  `,
})
export class DashboardTopbarComponent {
  protected readonly logout = injectLogout();
}
