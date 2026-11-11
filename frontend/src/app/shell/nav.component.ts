import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { LogoComponent } from './logo.component';

interface NavLink {
  label: string;
  path: string;
  exact: boolean;
}

@Component({
  selector: 'cv-nav',
  imports: [
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    LogoComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky top-0 z-100 block' },
  template: `
    <header class="relative border-b border-line-soft bg-surface-1/85 backdrop-blur-lg">
      <div class="mx-auto flex h-16 max-w-site items-center gap-2 px-6 md:px-8 lg:gap-8 xl:px-12">
        <cv-logo />
        <nav aria-label="Primary" class="hidden gap-1 self-stretch lg:flex">
          @for (link of links; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent-text"
              [routerLinkActiveOptions]="{ exact: link.exact }"
              ariaCurrentWhenActive="page"
              class="relative flex items-center px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4"
              >{{ link.label }}</a
            >
          }
        </nav>
        <p-button
          class="ml-auto lg:hidden"
          icon="pi pi-search"
          severity="secondary"
          size="large"
          [text]="true"
          aria-label="Search titles"
          [attr.aria-expanded]="searchOpen()"
          (onClick)="searchOpen.set(!searchOpen())"
        />
        <form
          role="search"
          autocomplete="off"
          class="absolute inset-x-0 top-full border-b border-line-soft bg-surface-1 px-6 pt-2 pb-4 md:px-8 lg:static lg:ml-auto lg:block lg:w-80 lg:border-0 lg:bg-transparent lg:p-0"
          [class.hidden]="!searchOpen()"
          (submit)="search($event, q.value)"
        >
          <label for="nav-search" class="sr-only">Search movies and shows</label>
          <p-iconfield class="block">
            <p-inputicon class="pi pi-search" />
            <input
              #q
              id="nav-search"
              pInputText
              type="search"
              class="w-full"
              placeholder="Search movies and shows"
              enterkeyhint="search"
            />
          </p-iconfield>
        </form>
        <div class="flex flex-none items-center gap-1 md:gap-2">
          <ng-content select="[auth]" />
        </div>
      </div>
      <nav
        aria-label="Primary (small screens)"
        class="flex gap-1 overflow-x-auto border-t border-line-soft px-3 md:px-5 lg:hidden"
      >
        @for (link of links; track link.path) {
          <a
            [routerLink]="link.path"
            routerLinkActive="text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent-text"
            [routerLinkActiveOptions]="{ exact: link.exact }"
            ariaCurrentWhenActive="page"
            class="relative flex min-h-11 flex-none items-center px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4"
            >{{ link.label }}</a
          >
        }
      </nav>
    </header>
  `,
})
export class NavComponent {
  private readonly router = inject(Router);

  protected readonly searchOpen = signal(false);

  // My List goes to /login?next= for visitors once auth exists (Task 13).
  protected readonly links: NavLink[] = [
    { label: 'Home', path: '/', exact: true },
    { label: 'TV Shows', path: '/tv', exact: false },
    { label: 'Movies', path: '/movies', exact: false },
    { label: 'New & Popular', path: '/new', exact: false },
    { label: 'My List', path: '/dashboard/favorites', exact: false },
  ];

  protected search(event: Event, value: string): void {
    event.preventDefault();
    const q = value.trim();
    if (!q) return;
    this.searchOpen.set(false);
    void this.router.navigate(['/search'], { queryParams: { q } });
  }
}
