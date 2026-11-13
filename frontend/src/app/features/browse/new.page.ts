import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CatalogService } from '@core/catalog/catalog.service';
import { ResponseStatus } from '@core/ssr/response-status.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { SectionHeaderComponent } from '@shared/components/section-header/section-header.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/** /new: what is new in cinemas and on air, movies and TV. Each section loads, fails and retries on its own. */
@Component({
  selector: 'cv-new',
  imports: [
    NgTemplateOutlet,
    PageHeaderComponent,
    PosterGridComponent,
    SectionHeaderComponent,
    StateBlockComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="site-gutter py-8 lg:py-10">
      <cv-page-header compact title="New &amp; Popular" />
      <div class="flex flex-col gap-12 lg:gap-16">
        <ng-container *ngTemplateOutlet="block; context: { heading: 'New movies', data: movies }" />
        <ng-container *ngTemplateOutlet="block; context: { heading: 'New TV shows', data: tv }" />
      </div>
    </section>

    <ng-template #block let-heading="heading" let-data="data">
      <section>
        <cv-section-header class="mb-4" [heading]="heading" />
        @if (data.hasValue()) {
          <cv-poster-grid [items]="data.value().items" />
        } @else if (data.error()) {
          <cv-state
            kind="error"
            message="Could not load these titles. Check your connection and try again."
            (retry)="data.reload()"
          />
        } @else {
          <cv-state kind="loading" />
        }
      </section>
    </ng-template>
  `,
})
export default class NewPage {
  private readonly catalog = inject(CatalogService);
  protected readonly movies = rxResource({ stream: () => this.catalog.list('new', 'movie') });
  protected readonly tv = rxResource({ stream: () => this.catalog.list('new', 'tv') });

  constructor() {
    // The lists are the page: with neither loaded it is a temporary failure; with one missing it is a
    // degraded 200. Neither is cached.
    const response = inject(ResponseStatus);
    effect(() => {
      if (this.movies.error() && this.tv.error()) response.set(503);
      else if (this.movies.error() || this.tv.error()) response.noStore();
    });
  }
}
