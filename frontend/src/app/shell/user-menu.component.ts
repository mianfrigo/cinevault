import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { MenuModule } from 'primeng/menu';
import { AuthStore } from '@core/auth/auth.store';
import { injectLogout } from '@core/auth/logout';
import { initials } from '@shared/utils/initials';
import { shortName } from '@shared/utils/short-name';

/**
 * Avatar, short name and chevron with a popup menu for the logged-in user: the panel is headed by the
 * full name and the email (mockup .menu-head), then the links, a hairline and Log out. The name is
 * left off the trigger below the laptop width. Loaded through @defer to keep it out of the initial bundle.
 */
@Component({
  selector: 'cv-user-menu',
  imports: [AvatarModule, MenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="group flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-fg-3"
      aria-label="Account menu"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (click)="menu.toggle($event)"
    >
      <p-avatar
        [label]="who().initials"
        shape="circle"
        styleClass="size-8! border border-line transition-colors group-hover:border-line-strong group-hover:text-fg"
      />
      <span class="hidden text-sm font-medium text-fg-2 lg:inline">{{ who().short }}</span>
      <i class="pi pi-chevron-down text-xs" aria-hidden="true"></i>
    </button>
    <p-menu
      #menu
      [model]="items()"
      [popup]="true"
      appendTo="body"
      styleClass="w-64"
      (onShow)="open.set(true)"
      (onHide)="open.set(false)"
    >
      <ng-template #start>
        <div class="mb-1 border-b border-line-soft px-3 py-3">
          <b class="block text-sm font-medium text-fg">{{ who().name }}</b>
          <small class="text-label text-fg-3">{{ who().email }}</small>
        </div>
      </ng-template>
    </p-menu>
  `,
})
export class UserMenuComponent {
  private readonly auth = inject(AuthStore);
  private readonly logout = injectLogout();

  protected readonly open = signal(false);

  /** What the trigger and the panel head show of the user, derived once. */
  protected readonly who = computed(() => {
    const user = this.auth.user();
    const name = user?.name ?? '';
    return { name, email: user?.email ?? '', initials: initials(name), short: shortName(name) };
  });

  protected readonly items = computed<MenuItem[]>(() => [
    { label: 'Favorites', icon: 'pi pi-heart', routerLink: '/dashboard/favorites' },
    { label: 'Account', icon: 'pi pi-user', routerLink: '/dashboard/account' },
    ...(this.auth.isAdmin()
      ? [{ label: 'Admin', icon: 'pi pi-shield', routerLink: '/admin/users' }]
      : []),
    { separator: true, styleClass: 'my-1' },
    { label: 'Log out', icon: 'pi pi-sign-out', command: () => void this.logout() },
  ]);
}
