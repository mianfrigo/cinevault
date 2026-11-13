import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CatalogService } from '@core/catalog/catalog.service';
import { SeoService, pageTitle } from '@core/seo/seo.service';
import { ResponseStatus } from '@core/ssr/response-status.service';
import { cutUnits } from '@shared/utils/cut-units';
import { latestValue } from '@shared/utils/latest-value';
import { injectPageNavigator, MAX_PAGE, normalisePage } from '@shared/utils/page-param';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/** The backend rejects a longer query with 400. */
const MAX_QUERY = 100;

/** /search?q=&page=. The search box in the nav is the only input; this page just reads the URL. */
@Component({
  selector: 'cv-search',
  imports: [PageHeaderComponent, PosterGridComponent, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="site-gutter py-8 lg:py-10">
      <cv-page-header
        compact
        [title]="heading()"
        [lead]="truncated() ? 'Searching for the first 100 characters of your query.' : undefined"
      />

      @if (!term()) {
        <cv-state kind="empty" message="Type a title in the search box to find movies and shows." />
      } @else if (shown(); as data) {
        <!-- While the next page loads, the previous one stays (dimmed) so keyboard focus is not lost. -->
        <div
          [attr.aria-busy]="results.isLoading()"
          class="transition-opacity duration-150"
          [class.opacity-60]="results.isLoading()"
        >
          @if (data.items.length === 0) {
            <cv-state
              kind="empty"
              [message]="
                data.totalPages === 0
                  ? 'No titles match “' + term() + '”. Check the spelling or try another search.'
                  : 'No titles on this page.'
              "
            />
          }
          <cv-poster-grid
            [items]="data.items"
            [page]="currentPage()"
            [totalPages]="totalPages()"
            (pageChange)="goTo($event)"
          />
        </div>
      } @else if (results.error()) {
        <cv-state
          kind="error"
          message="Could not run the search. Check your connection and try again."
          (retry)="results.reload()"
        />
      } @else {
        <cv-state kind="loading" />
      }
    </section>
  `,
})
export default class SearchPage {
  private readonly catalog = inject(CatalogService);
  protected readonly goTo = injectPageNavigator();

  // Route inputs (query params), untrusted.
  readonly q = input<unknown>();
  readonly page = input<unknown>();

  private readonly raw = computed(() =>
    typeof this.q() === 'string' ? (this.q() as string).trim() : '',
  );
  private readonly cut = computed(() => cutUnits(this.raw(), MAX_QUERY));
  protected readonly heading = computed(() =>
    this.term() ? `Results for “${this.term()}”` : 'Search',
  );
  protected readonly truncated = computed(() => this.cut() !== this.raw());
  /** The query that is searched: trimmed and cut to 100 characters (longer ones are not sent as-is). Empty means no search. */
  protected readonly term = computed(() => this.cut().trim());
  protected readonly currentPage = computed(() => normalisePage(this.page()));

  // An empty term gives undefined params, so the resource stays idle and sends nothing.
  protected readonly results = rxResource({
    params: () => (this.term() ? { q: this.term(), page: this.currentPage() } : undefined),
    stream: ({ params }) => this.catalog.search(params.q, params.page),
  });

  protected readonly shown = latestValue(this.results, this.term);

  protected readonly totalPages = computed(() => Math.min(this.shown()?.totalPages ?? 0, MAX_PAGE));

  constructor() {
    const seo = inject(SeoService);
    const response = inject(ResponseStatus);
    // The results are the page: when they cannot be loaded the page is a temporary failure, never cached.
    effect(() => {
      if (this.results.error()) response.set(503);
    });
    // The query is user input: it only ever goes in as text (Title and Meta set it as such).
    effect(() => {
      const term = this.term();
      seo.set({
        title: pageTitle(term ? `Search: ${term}` : 'Search'),
        path: term ? `/search?q=${encodeURIComponent(term)}` : '/search',
        // Result pages for arbitrary queries are not worth indexing; the bare search page is.
        noindex: !!term,
      });
    });
  }
}
