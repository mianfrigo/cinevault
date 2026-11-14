import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthStore } from '@core/auth/auth.store';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { NavSearchComponent } from './nav-search.component';
import { UserMenuComponent } from './user-menu.component';

const LINK =
  'relative flex items-center px-3 text-sm font-medium text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:-outline-offset-4';

interface NavLink {
  label: string;
  path: string;
  query?: Record<string, string>;
  exact: boolean;
}

@Component({
  selector: 'cv-nav',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    LogoComponent,
    NavSearchComponent,
    UserMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sticky top-0 z-100 block' },
  template: `
    <header class="relative border-b border-line-soft bg-surface-1/85 backdrop-blur-lg">
      <div class="site-gutter flex h-16 items-center gap-2 lg:gap-8">
        <cv-logo />
        <nav aria-label="Primary" class="hidden gap-1 self-stretch lg:flex">
          <ng-container *ngTemplateOutlet="items; context: wide" />
        </nav>
        <p-button
          class="ml-auto lg:hidden"
          icon="pi pi-search"
          severity="secondary"
          size="large"
          [text]="true"
          #toggle
          ariaLabel="Search titles"
          [pt]="toggleAttrs()"
          (onClick)="toggleSearch()"
        />
        <!-- The search box (and Angular Forms with it) loads when the phone toggle opens it or the first
             time the box is used; the server still renders it, so it is there before any script. -->
        @defer (on idle; prefetch on idle; hydrate on interaction; hydrate when searchOpen()) {
          <cv-nav-search
            [open]="searchOpen()"
            (submitted)="searchOpen.set(false)"
            (dismissed)="closeSearch()"
          />
        }
        <div class="flex flex-none items-center gap-1 md:gap-2">
          @if (auth.ready()) {
            @if (auth.isLoggedIn()) {
              @defer (on immediate) {
                <cv-user-menu />
              }
            } @else {
              <p-button label="Log in" severity="secondary" [text]="true" routerLink="/login" />
              <p-button label="Register" class="hidden sm:block" routerLink="/register" />
            }
          }
        </div>
      </div>
      <nav
        aria-label="Primary (small screens)"
        class="flex gap-1 overflow-x-auto border-t border-line-soft px-3 md:px-5 lg:hidden"
      >
        <ng-container *ngTemplateOutlet="items; context: narrow" />
      </nav>
    </header>

    <!-- The links of both navs: only the classes differ (the underline sits on the bar's edge from 1024px, on the tab row below). -->
    <ng-template #items let-classes="classes" let-active="active">
      @for (link of links(); track link.label) {
        <a
          [routerLink]="link.path"
          [queryParams]="link.query"
          [routerLinkActive]="active"
          [routerLinkActiveOptions]="{ exact: link.exact }"
          ariaCurrentWhenActive="page"
          [class]="classes"
          >{{ link.label }}</a
        >
      }
    </ng-template>
  `,
})
export class NavComponent {
  protected readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);
  private readonly toggle = viewChild.required('toggle', { read: ElementRef });

  /** Link classes of the desktop bar and of the small-screen tab row. */
  protected readonly wide = {
    classes: LINK,
    active:
      'text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent-text',
  };
  protected readonly narrow = {
    classes: LINK + ' min-h-11 flex-none',
    active:
      'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-accent-text',
  };

  protected readonly searchOpen = signal(false);

  // p-button only forwards ariaLabel; aria-expanded reaches the inner <button> through pt.
  protected readonly toggleAttrs = computed(() => ({
    root: { 'aria-expanded': String(this.searchOpen()) },
  }));

  // My List goes to /login?next= for visitors (app-flow section 2).
  protected readonly links = computed<NavLink[]>(() => [
    { label: 'Home', path: '/', exact: true },
    { label: 'TV Shows', path: '/tv', exact: false },
    { label: 'Movies', path: '/movies', exact: false },
    { label: 'New & Popular', path: '/new', exact: false },
    this.auth.isLoggedIn()
      ? { label: 'My List', path: '/dashboard/favorites', exact: false }
      : { label: 'My List', path: '/login', query: { next: '/dashboard/favorites' }, exact: false },
  ]);

  protected toggleSearch(): void {
    if (this.searchOpen()) return this.closeSearch();
    this.searchOpen.set(true);
  }

  /** Closes the mobile panel; focus goes back to the toggle only if it was inside the panel. */
  protected closeSearch(): void {
    if (!this.searchOpen()) return;
    this.searchOpen.set(false);
    afterNextRender(() => this.toggle().nativeElement.querySelector('button')?.focus(), {
      injector: this.injector,
    });
  }
}
