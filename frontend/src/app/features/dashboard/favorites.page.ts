import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  PLATFORM_ID,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '../../core/auth/auth.store';
import { FavoriteItem } from '../../core/models';
import { MAX_PAGE, normalisePage } from '../../shared/page-param';
import { PaginatorComponent } from '../../shared/paginator.component';
import { PosterCardComponent } from '../../shared/poster-card.component';
import { StateBlockComponent } from '../../shared/state-block.component';
import { FavoritesFilter, FavoritesPageStore, favoriteKey } from './favorites-page.store';

const FILTERS: { label: string; value: FavoritesFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Movies', value: 'movie' },
  { label: 'Series', value: 'tv' },
];

/** The toast of a removal. It is keyed so the app's own toast never shows it, and it is mirrored from the store. */
const UNDO_KEY = 'undo';

/**
 * /dashboard/favorites?type=&page=. The URL is the source of truth: the filter and the paginator
 * navigate, the inputs change and the store loads. Nothing user specific renders on the server
 * (the guard lets it through without a session): there the page stays on its skeleton.
 */
@Component({
  selector: 'cv-favorites-page',
  imports: [
    RouterLink,
    FormField,
    ButtonModule,
    MessageModule,
    SelectButtonModule,
    ToastModule,
    PaginatorComponent,
    PosterCardComponent,
    StateBlockComponent,
  ],
  // Its own MessageService: the toast of this page is keyed and mirrors the store, nothing else shows in it.
  providers: [FavoritesPageStore, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 #heading tabindex="-1" class="text-h1 text-fg outline-none">Favorites</h1>
        @if (store.status() === 'idle') {
          <p class="mt-2 text-sm text-fg-3 tabular-nums">
            {{ store.visibleTotal() }} saved {{ store.visibleTotal() === 1 ? 'title' : 'titles' }}
          </p>
        }
      </div>
      <div class="self-start">
        <span id="fav-filter" class="sr-only">Filter favorites</span>
        <p-selectbutton
          [options]="filters"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false"
          ariaLabelledBy="fav-filter"
          [formField]="filterForm.type"
          (onChange)="setFilter($event.value)"
        />
      </div>
    </header>

    @if (store.removeFailed(); as failed) {
      <p-message severity="error" role="alert" class="mb-6 block">
        Could not remove {{ failed }}. It is still in your favorites.
      </p-message>
    }

    @if (store.status() === 'error') {
      <cv-state
        kind="error"
        message="Could not load your favorites. Check your connection and try again."
        (retry)="store.reload()"
      />
    } @else if (store.status() === 'loading' && store.items().length === 0) {
      <cv-state kind="loading" />
    } @else if (store.visibleTotal() === 0) {
      <div class="grid justify-items-center gap-3 border-t border-line-soft px-3 py-16 text-center">
        <h2 class="text-h2 text-fg">
          {{ filter() === 'all' ? 'You have not saved anything yet.' : emptyFiltered() }}
        </h2>
        <p class="max-w-[44ch] text-sm text-fg-2">
          Add a movie or series with My List and it will wait here for you, on every device you sign
          in to.
        </p>
        <a pButton routerLink="/" class="mt-3">Browse trending</a>
      </div>
    } @else {
      <!-- While the next page loads, the previous one stays (dimmed) so keyboard focus is not lost. -->
      <div
        [attr.aria-busy]="store.status() === 'loading'"
        class="transition-opacity duration-150"
        [class.opacity-60]="store.status() === 'loading'"
      >
        @if (store.visibleItems().length === 0) {
          <cv-state kind="empty" message="No favorites on this page." />
        }
        <ul
          class="grid grid-cols-[repeat(auto-fill,minmax(--spacing(37),1fr))] gap-x-3 gap-y-4 md:grid-cols-[repeat(auto-fill,minmax(--spacing(42),1fr))] md:gap-x-4 md:gap-y-6"
        >
          @for (item of store.visibleItems(); track key(item)) {
            <li class="min-w-0">
              @if (item.unavailable) {
                <div class="block min-w-0">
                  <div
                    class="grid aspect-[2/3] place-items-center rounded-md bg-surface-2 p-3 text-center text-sm font-medium text-fg-2 ring-1 ring-line ring-inset"
                  >
                    {{ item.title }}
                  </div>
                  <p class="mt-3 text-label text-fg-3">This title is no longer available.</p>
                  <p-button
                    label="Remove"
                    severity="secondary"
                    [text]="true"
                    size="small"
                    [ariaLabel]="'Remove unavailable title ' + item.tmdbId + ' from favorites'"
                    (onClick)="remove(item)"
                  />
                </div>
              } @else {
                <cv-poster-card [title]="item" [removable]="true" (removed)="remove(item)" />
              }
            </li>
          }
        </ul>
        <cv-paginator [page]="currentPage()" [totalPages]="pages()" (pageChange)="goTo($event)" />
      </div>
    }

    <p-toast key="undo" position="bottom-center" class="max-lg:bottom-20!">
      <ng-template #message let-message>
        <div class="flex w-full min-w-64 items-center justify-between gap-3">
          <span class="text-sm">{{ message.summary }}</span>
          <p-button
            class="shrink-0"
            data-undo
            label="Undo"
            size="small"
            severity="secondary"
            [text]="true"
            (onClick)="undo()"
          />
        </div>
      </ng-template>
    </p-toast>
  `,
})
export default class FavoritesPage {
  protected readonly store = inject(FavoritesPageStore);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  // Route inputs. They come from the URL, so they are untrusted.
  readonly type = input<unknown>();
  readonly page = input<unknown>();

  protected readonly filters = FILTERS;
  protected readonly key = favoriteKey;

  protected readonly filter = computed<FavoritesFilter>(() => {
    const t = this.type();
    return t === 'movie' || t === 'tv' ? t : 'all';
  });
  protected readonly currentPage = computed(() => normalisePage(this.page()));
  /** The API serves at most 500 pages; an empty list reports 0. */
  protected readonly pages = computed(() => Math.min(this.store.totalPages(), MAX_PAGE));
  protected readonly emptyFiltered = computed(
    () => `You have not saved any ${this.filter() === 'tv' ? 'series' : 'movies'} yet.`,
  );

  // The select button's value follows the URL; picking one navigates (see setFilter).
  private readonly filterModel = linkedSignal(() => ({ type: this.filter() }));
  protected readonly filterForm = form(this.filterModel);

  constructor() {
    // Only a logged in browser asks for the list: the server has no session, so it renders the skeleton.
    effect(() => {
      if (!this.auth.isLoggedIn()) return;
      const [type, page] = [this.filter(), this.currentPage()];
      untracked(() => this.store.show(type, page));
    });

    // The toast mirrors the store: it is there exactly while a removal can be undone.
    effect(() => {
      const pending = this.store.pendingRemoval();
      untracked(() => {
        // The toast goes (timer end): keyboard focus on its Undo button would fall to the page body, so it goes to the heading.
        if (!pending && this.host.contains(this.host.ownerDocument.activeElement)) {
          const active = this.host.ownerDocument.activeElement as HTMLElement;
          if (active.closest('[data-undo]')) this.heading().nativeElement.focus();
        }
        this.messages.clear(UNDO_KEY);
        if (!pending) return;
        this.messages.add({
          key: UNDO_KEY,
          severity: 'secondary',
          summary: `Removed ${pending.item.title} from favorites.`,
          sticky: true,
          closable: false,
        });
        // The remove button that was used is gone: put the keyboard on Undo.
        this.focusLater((host) => host.querySelector('[data-undo] button'));
      });
    });
  }

  protected setFilter(type: FavoritesFilter): void {
    void this.router.navigate([], {
      queryParams: { type: type === 'all' ? null : type, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected goTo(page: number): void {
    void this.router.navigate([], {
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  }

  protected remove(item: FavoriteItem): void {
    this.store.remove(item);
  }

  protected undo(): void {
    const restored = this.store.pendingRemoval()?.item;
    this.store.undo();
    // Focus was on Undo, which is gone now: it goes back to the title that came back.
    if (restored) {
      const label = `Remove ${restored.title} from favorites`;
      this.focusLater((host) =>
        Array.from(host.querySelectorAll('button')).find(
          (b) => b.getAttribute('aria-label') === label,
        ),
      );
    }
  }

  /** Focuses the element once the next render has drawn it (the toast appears a moment after the store changes). */
  private focusLater(find: (host: HTMLElement) => HTMLElement | null | undefined): void {
    if (!this.browser) return;
    afterNextRender(() => find(this.host)?.focus(), { injector: this.injector });
  }
}
