import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TitleSummary } from '@core/models';
import { PaginatorComponent } from '@shared/components/paginator/paginator.component';
import { PosterCardComponent } from '@shared/components/poster-card/poster-card.component';

/** Responsive grid of poster cards with the paginator below it (hidden for a single page). */
@Component({
  selector: 'cv-poster-grid',
  imports: [PosterCardComponent, PaginatorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <ul
      class="grid grid-cols-[repeat(auto-fill,minmax(--spacing(37),1fr))] gap-x-3 gap-y-4 md:grid-cols-[repeat(auto-fill,minmax(--spacing(42),1fr))] md:gap-x-4 md:gap-y-6"
    >
      @for (t of items(); track t.mediaType + t.tmdbId) {
        <li class="min-w-0"><cv-poster-card [title]="t" /></li>
      }
    </ul>
    <cv-paginator
      [page]="page()"
      [totalPages]="totalPages()"
      (pageChange)="pageChange.emit($event)"
    />
  `,
})
export class PosterGridComponent {
  readonly items = input.required<TitleSummary[]>();
  /** Current page, 1-based. */
  readonly page = input(1);
  /** Already capped (the API serves at most 500 pages). */
  readonly totalPages = input(1);
  readonly pageChange = output<number>();
}
