import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CatalogService } from '../../core/catalog/catalog.service';
import { injectPageNavigator, MAX_PAGE, normalisePage } from '../../shared/page-param';
import { StateBlockComponent } from '../../shared/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/** The backend rejects a longer query with 400. */
const MAX_QUERY = 100;

/** /search?q=&page=. The search box in the nav is the only input; this page just reads the URL. */
@Component({
  selector: 'cv-search',
  imports: [PosterGridComponent, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-site px-6 py-8 md:px-8 lg:py-10 xl:px-12">
      <header class="mb-6 md:mb-8">
        <h1 class="text-h1 text-fg">
          @if (term(); as t) {
            Results for “{{ t }}”
          } @else {
            Search
          }
        </h1>
        @if (truncated()) {
          <p class="mt-2 text-sm text-fg-3">
            Searching for the first 100 characters of your query.
          </p>
        }
      </header>

      @if (!term()) {
        <cv-state kind="empty" message="Type a title in the search box to find movies and shows." />
      } @else if (results.hasValue()) {
        @if (results.value().items.length === 0) {
          <cv-state
            kind="empty"
            [message]="
              'No titles match “' + term() + '”. Check the spelling or try another search.'
            "
          />
        }
        <cv-poster-grid
          [items]="results.value().items"
          [page]="currentPage()"
          [totalPages]="totalPages()"
          (pageChange)="goTo($event)"
        />
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
  protected readonly truncated = computed(() => this.raw().length > MAX_QUERY);
  /** The query that is searched: trimmed and cut to 100 characters (longer ones are not sent as-is). Empty means no search. */
  protected readonly term = computed(() => this.raw().slice(0, MAX_QUERY).trim());
  protected readonly currentPage = computed(() => normalisePage(this.page()));

  // An empty term gives undefined params, so the resource stays idle and sends nothing.
  protected readonly results = rxResource({
    params: () => (this.term() ? { q: this.term(), page: this.currentPage() } : undefined),
    stream: ({ params }) => this.catalog.search(params.q, params.page),
  });

  protected readonly totalPages = computed(() =>
    Math.min(this.results.value()?.totalPages ?? 0, MAX_PAGE),
  );
}
