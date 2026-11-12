import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SkeletonModule } from 'primeng/skeleton';
import { CatalogService } from '@core/catalog/catalog.service';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';

/** The episodes of one season. It exists only once its panel has been opened, so opening is what requests it. */
@Component({
  selector: 'cv-episodes',
  imports: [DatePipe, SkeletonModule, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (episodes.hasValue()) {
      @if (episodes.value().episodes.length === 0) {
        <p class="py-3 text-sm text-fg-3">No episodes listed yet.</p>
      } @else {
        <ol>
          @for (e of episodes.value().episodes; track e.number) {
            <li
              class="grid grid-cols-[2rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-line-soft py-3 first:border-t-0"
            >
              <span class="text-sm text-fg-3 tabular-nums">{{ e.number }}</span>
              <b class="text-sm font-medium">{{ e.name }}</b>
              @if (e.airDate) {
                <span class="text-label text-fg-3">{{ e.airDate | date: 'mediumDate' }}</span>
              }
              @if (e.overview) {
                <p class="col-start-2 max-w-[62ch] text-sm text-fg-2">{{ e.overview }}</p>
              }
            </li>
          }
        </ol>
      }
    } @else if (episodes.error()) {
      <cv-state
        kind="error"
        message="Could not load this season. Check your connection and try again."
        (retry)="episodes.reload()"
      />
    } @else {
      <div role="status" aria-busy="true" class="grid gap-3 py-3">
        <span class="sr-only">Loading episodes</span>
        <p-skeleton width="50%" height="1rem" />
        <p-skeleton width="80%" height="1rem" />
        <p-skeleton width="65%" height="1rem" />
      </div>
    }
  `,
})
export class EpisodesComponent {
  private readonly catalog = inject(CatalogService);

  readonly tvId = input.required<number>();
  readonly number = input.required<number>();

  protected readonly episodes = rxResource({
    params: () => ({ tvId: this.tvId(), n: this.number() }),
    stream: ({ params }) => this.catalog.season(params.tvId, params.n),
  });
}
