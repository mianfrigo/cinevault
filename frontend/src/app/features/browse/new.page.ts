import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { CatalogService } from '../../core/catalog/catalog.service';
import { StateBlockComponent } from '../../shared/state-block.component';
import { PosterGridComponent } from './poster-grid.component';

/** /new: what is new in cinemas and on air, movies and TV. Each section loads, fails and retries on its own. */
@Component({
  selector: 'cv-new',
  imports: [NgTemplateOutlet, PosterGridComponent, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-site px-6 py-8 md:px-8 lg:py-10 xl:px-12">
      <h1 class="mb-6 text-h1 text-fg md:mb-8">New &amp; Popular</h1>
      <div class="flex flex-col gap-12 lg:gap-16">
        <ng-container *ngTemplateOutlet="block; context: { heading: 'New movies', data: movies }" />
        <ng-container *ngTemplateOutlet="block; context: { heading: 'New TV shows', data: tv }" />
      </div>
    </section>

    <ng-template #block let-heading="heading" let-data="data">
      <section>
        <h2 class="mb-4 text-h2 text-fg">{{ heading }}</h2>
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
}
