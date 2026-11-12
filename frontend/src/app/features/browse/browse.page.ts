import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CatalogService } from '../../core/catalog/catalog.service';
import { MediaTypeParam } from '../../core/models';
import { injectPageNavigator, MAX_PAGE, normalisePage } from '../../shared/page-param';
import { StateBlockComponent } from '../../shared/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/**
 * /movies, /tv (popular titles) and /genre/:type/:id (discover). The route supplies `type`
 * (route data or path param), `id` and `page` through component input binding.
 */
@Component({
  selector: 'cv-browse',
  imports: [RouterLink, RouterLinkActive, PosterGridComponent, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-site px-6 py-8 md:px-8 lg:py-10 xl:px-12">
      <header class="mb-6 md:mb-8">
        <h1 class="text-h1 text-fg">{{ heading() }}</h1>
        <p class="mt-2 text-sm text-fg-3">{{ subheading() }}</p>
      </header>

      @if (genreList.hasValue() && request(); as req) {
        <nav
          aria-label="Genres"
          class="-mx-6 mb-8 flex gap-2 overflow-x-auto px-6 pb-1 md:mx-0 md:flex-wrap md:px-0"
        >
          <a
            [routerLink]="[req.type === 'tv' ? '/tv' : '/movies']"
            [class]="chip"
            [routerLinkActive]="chipActive"
            [routerLinkActiveOptions]="{ exact: true }"
            ariaCurrentWhenActive="page"
            >All</a
          >
          @for (g of genreList.value(); track g.id) {
            <a
              [routerLink]="['/genre', req.type, g.id]"
              [class]="chip"
              [routerLinkActive]="chipActive"
              ariaCurrentWhenActive="page"
              >{{ g.name }}</a
            >
          }
        </nav>
      }

      @if (!request()) {
        <cv-state kind="empty" message="This genre does not exist." />
      } @else if (titles.hasValue()) {
        @if (titles.value().items.length === 0) {
          <cv-state kind="empty" message="No titles to show here." />
        }
        <cv-poster-grid
          [items]="titles.value().items"
          [page]="currentPage()"
          [totalPages]="totalPages()"
          (pageChange)="goTo($event)"
        />
      } @else if (titles.error()) {
        <cv-state
          kind="error"
          message="Could not load these titles. Check your connection and try again."
          (retry)="titles.reload()"
        />
      } @else {
        <cv-state kind="loading" />
      }
    </section>
  `,
})
export default class BrowsePage {
  private readonly catalog = inject(CatalogService);
  protected readonly goTo = injectPageNavigator();

  protected readonly chip =
    'inline-flex min-h-11 flex-none items-center rounded-lg border border-line px-4 text-sm font-medium text-fg-2 transition-colors duration-150 hover:bg-hover hover:text-fg';
  protected readonly chipActive = 'bg-surface-4 text-fg';

  // Route inputs. They come from the URL, so they are untrusted and validated in `request`.
  readonly type = input<unknown>();
  readonly id = input<unknown>();
  readonly page = input<unknown>();

  protected readonly currentPage = computed(() => normalisePage(this.page()));

  /** What to ask the API for, or undefined for a route that names no such catalog (no request is made). */
  protected readonly request = computed(() => {
    const type = this.type();
    if (type !== 'movie' && type !== 'tv') return undefined;
    const rawId = this.id();
    if (rawId === undefined) return { type: type as MediaTypeParam, page: this.currentPage() };
    const genre = typeof rawId === 'string' && /^\d+$/.test(rawId) ? Number(rawId) : 0;
    return Number.isSafeInteger(genre) && genre >= 1
      ? { type: type as MediaTypeParam, genre, page: this.currentPage() }
      : undefined;
  });

  protected readonly titles = rxResource({
    params: this.request,
    stream: ({ params }) =>
      params.genre === undefined
        ? this.catalog.list('popular', params.type, params.page)
        : this.catalog.discover(params.type, params.genre, params.page),
  });

  // Keyed on the type only, so paging does not fetch the genres again.
  protected readonly genreList = rxResource({
    params: () => this.request()?.type,
    stream: ({ params }) => this.catalog.genres(params),
  });

  /** The API serves at most 500 pages; an empty list reports 0. */
  protected readonly totalPages = computed(() =>
    Math.min(this.titles.value()?.totalPages ?? 0, MAX_PAGE),
  );

  protected readonly heading = computed(() => {
    const req = this.request();
    if (req?.genre !== undefined) {
      return this.genreList.value()?.find((g) => g.id === req.genre)?.name ?? 'Genre';
    }
    return req?.type === 'tv' ? 'TV Shows' : req ? 'Movies' : 'Genre';
  });

  protected readonly subheading = computed(() => {
    const req = this.request();
    if (!req) return '';
    if (req.genre !== undefined) return req.type === 'tv' ? 'TV shows' : 'Movies';
    return 'Popular right now';
  });
}
