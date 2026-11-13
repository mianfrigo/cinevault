import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CatalogService } from '@core/catalog/catalog.service';
import { SeoService, pageTitle } from '@core/seo/seo.service';
import { ResponseStatus } from '@core/ssr/response-status.service';
import { MediaTypeParam } from '@core/models';
import { latestValue } from '@shared/utils/latest-value';
import { injectPageNavigator, MAX_PAGE, normalisePage } from '@shared/utils/page-param';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/**
 * /movies, /tv (popular titles) and /genre/:type/:id (discover). The route supplies `type`
 * (route data or path param), `id` and `page` through component input binding.
 */
@Component({
  selector: 'cv-browse',
  imports: [
    RouterLink,
    RouterLinkActive,
    PageHeaderComponent,
    PosterGridComponent,
    StateBlockComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="site-gutter py-8 lg:py-10">
      <cv-page-header compact [title]="heading()" [lead]="subheading() || undefined" />

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
      } @else if (shown(); as data) {
        <!-- While the next page loads, the previous one stays (dimmed) so keyboard focus is not lost. -->
        <div
          [attr.aria-busy]="titles.isLoading()"
          class="transition-opacity duration-150"
          [class.opacity-60]="titles.isLoading()"
        >
          @if (data.items.length === 0) {
            <cv-state kind="empty" message="No titles to show here." />
          }
          <cv-poster-grid
            [items]="data.items"
            [page]="currentPage()"
            [totalPages]="totalPages()"
            (pageChange)="goTo($event)"
          />
        </div>
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

  protected readonly shown = latestValue(this.titles, () => {
    const req = this.request();
    return `${req?.type}/${req?.genre}`;
  });

  /** The API serves at most 500 pages; an empty list reports 0. */
  protected readonly totalPages = computed(() => Math.min(this.shown()?.totalPages ?? 0, MAX_PAGE));

  /** The name of the genre in the URL, once the genre list is loaded. */
  private readonly genreName = computed(() => {
    const genre = this.request()?.genre;
    // value() throws while the genres request is in error, so read it only behind hasValue().
    return this.genreList.hasValue()
      ? this.genreList.value().find((g) => g.id === genre)?.name
      : undefined;
  });

  protected readonly heading = computed(() => {
    const req = this.request();
    if (req?.genre !== undefined) return this.genreName() ?? 'Genre';
    return req?.type === 'tv' ? 'TV Shows' : req ? 'Movies' : 'Genre';
  });

  constructor() {
    const seo = inject(SeoService);
    const response = inject(ResponseStatus);
    // /movies and /tv have a static route title; a genre page is named after its genre.
    effect(() => {
      if (this.id() === undefined) return;
      const req = this.request();
      if (!req) {
        response.set(404);
        seo.set({ title: pageTitle('Genre not found'), noindex: true });
        return;
      }
      seo.set({
        title: pageTitle(this.genreName() ?? 'Genre'),
        path: `/genre/${req.type}/${req.genre}`,
        // A well-formed id TMDB has no genre for (the list is loaded and does not name it).
        noindex: this.genreList.hasValue() && this.genreName() === undefined,
      });
    });
    // The titles are the page: when they cannot be loaded it is a temporary failure, never cached.
    effect(() => {
      if (this.titles.error()) response.set(503);
    });
    // The genre chips are secondary: the page stays a 200, but without them it is not cached.
    effect(() => {
      if (this.genreList.error()) response.noStore();
    });
  }

  protected readonly subheading = computed(() => {
    const req = this.request();
    if (!req) return '';
    if (req.genre !== undefined) return req.type === 'tv' ? 'TV shows' : 'Movies';
    return 'Popular right now';
  });
}
