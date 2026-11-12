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
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { AuthStore } from '../../core/auth/auth.store';
import { FavoritesStore } from '../../core/favorites/favorites.store';
import { FavoriteItem } from '../../core/models';
import { MAX_PAGE, normalisePage } from '../../shared/page-param';
import { PaginatorComponent } from '../../shared/paginator.component';
import { PosterCardComponent } from '../../shared/poster-card.component';
import { StateBlockComponent } from '../../shared/state-block.component';
import { FavoritesFilter, FavoritesPageStore, favoriteKey } from './favorites-page.store';

const FILTERS: { name: string; value: FavoritesFilter }[] = [
  { name: 'All', value: 'all' },
  { name: 'Movies', value: 'movie' },
  { name: 'Series', value: 'tv' },
];

/** Placeholder cards of the loading state: the grid keeps its shape, so nothing jumps when the titles arrive. */
const SKELETON_CARDS = Array.from({ length: 12 }, (_, i) => i);

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
    SkeletonModule,
    ToastModule,
    PaginatorComponent,
    PosterCardComponent,
    StateBlockComponent,
  ],
  // Its own MessageService: the toast of this page is keyed and mirrors the store, nothing else shows in it.
  providers: [FavoritesPageStore, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 #heading tabindex="-1" class="text-h1 text-fg outline-none">Favorites</h1>
        <!-- min-h keeps the line's place while the count is not known yet. -->
        <p class="mt-2 min-h-5 text-sm text-fg-3 tabular-nums">{{ lead() }}</p>
      </div>
      <div class="self-start">
        <span id="fav-filter" class="sr-only">Filter favorites</span>
        <!-- Mockup .seg-tabs: a hairline frame, the chosen pill raised one surface step. -->
        <p-selectbutton
          class="gap-0.5 rounded-lg border border-line p-0.5"
          [options]="filterOptions()"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false"
          ariaLabelledBy="fav-filter"
          [formField]="filterForm.type"
          (onChange)="setFilter($event.value)"
        >
          <ng-template #item let-option>
            <span class="inline-flex items-center gap-2">
              {{ option.name }}
              @if (option.count !== null) {
                <span class="text-label font-normal text-fg-3 tabular-nums">{{
                  option.count
                }}</span>
              }
            </span>
          </ng-template>
        </p-selectbutton>
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
      <div role="status" aria-busy="true">
        <span class="sr-only">Loading</span>
        <div [class]="gridClass" aria-hidden="true">
          @for (n of skeletonCards; track n) {
            <div>
              <p-skeleton class="block aspect-[2/3]" height="auto" borderRadius="6px" />
              <p-skeleton class="mt-3 block" width="75%" height="0.875rem" />
              <p-skeleton class="mt-1.5 block" width="45%" height="0.8125rem" />
            </div>
          }
        </div>
      </div>
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
        <ul [class]="gridClass">
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
                <cv-poster-card
                  [title]="item"
                  [removable]="true"
                  [detailed]="true"
                  (removed)="remove(item)"
                />
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

  protected readonly skeletonCards = SKELETON_CARDS;
  protected readonly key = favoriteKey;
  /** Mockup .grid: 148px columns on a phone, 168px from 768px; the row gap is wider than the column gap. */
  protected readonly gridClass =
    'grid grid-cols-[repeat(auto-fill,minmax(--spacing(37),1fr))] gap-x-4 gap-y-6 md:grid-cols-[repeat(auto-fill,minmax(--spacing(42),1fr))] md:gap-x-6 md:gap-y-8';

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

  /**
   * Saved titles by type, from the hearts store (it holds every favorite and already leaves out a pending
   * removal). Null until its ids have loaded: no number is better than a 0 that is wrong.
   */
  private readonly counts = inject(FavoritesStore).counts;

  /** The pills: the label is also what a screen reader says ("Movies, 7 titles"), so the count is not lost. */
  protected readonly filterOptions = computed(() =>
    FILTERS.map(({ name, value }) => {
      const count = this.counts()?.[value === 'all' ? 'all' : value] ?? null;
      return {
        name,
        value,
        count,
        label: count === null ? name : `${name}, ${count} ${count === 1 ? 'title' : 'titles'}`,
      };
    }),
  );

  /** "11 saved titles". The count of the whole list, as in the mockup, not of the filter. */
  protected readonly lead = computed(() => {
    const n = this.counts()?.all ?? null;
    if (n === null) return '';
    return n === 0 ? 'No saved titles yet' : `${n} saved ${n === 1 ? 'title' : 'titles'}`;
  });

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

    // A removal that emptied the last page leaves the current page past the end: step back to the
    // last page (replacing the history entry). Only the page heading is re-used, so focus stays put.
    effect(() => {
      const last = this.store.totalPages();
      if (this.store.status() !== 'idle' || this.store.items().length > 0) return;
      if (last > 0 && this.store.page() > last) {
        untracked(() => {
          void this.router.navigate([], {
            queryParams: { page: last > 1 ? last : null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        });
      }
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
