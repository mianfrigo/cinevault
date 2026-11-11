import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { MenuModule } from 'primeng/menu';
import { AuthStore } from '../core/auth/auth.store';

/** Avatar with a popup menu for the logged-in user. Loaded through @defer to keep it out of the initial bundle. */
@Component({
  selector: 'cv-user-menu',
  imports: [AvatarModule, MenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="cursor-pointer rounded-full"
      aria-label="Account menu"
      aria-haspopup="menu"
      (click)="menu.toggle($event)"
    >
      <p-avatar [label]="initial()" shape="circle" />
    </button>
    <p-menu #menu [model]="items()" [popup]="true" appendTo="body" />
  `,
})
export class UserMenuComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly initial = computed(() => this.auth.user()?.name.charAt(0).toUpperCase() ?? '');

  protected readonly items = computed<MenuItem[]>(() => [
    { label: 'Favorites', icon: 'pi pi-heart', routerLink: '/dashboard/favorites' },
    { label: 'Account', icon: 'pi pi-user', routerLink: '/dashboard/account' },
    ...(this.auth.isAdmin()
      ? [{ label: 'Admin', icon: 'pi pi-shield', routerLink: '/admin/users' }]
      : []),
    { separator: true },
    { label: 'Log out', icon: 'pi pi-sign-out', command: () => void this.logout() },
  ]);

  private async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }
}
