import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AccordionModule } from 'primeng/accordion';
import { SkeletonModule } from 'primeng/skeleton';
import { CatalogService } from '../../core/catalog/catalog.service';
import { TitleDetail } from '../../core/models';
import { StateBlockComponent } from '../../shared/state-block.component';

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

/** Season panels (PrimeNG Accordion). A season's episodes are requested when its panel is first opened. */
@Component({
  selector: 'cv-seasons',
  imports: [AccordionModule, EpisodesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // PrimeNG 22.1 Accordion (p-motion) keeps the hidden styles of its server markup after hydration, so
  // panels would never open. The client rebuilds this subtree instead (episodes come from the transfer cache).
  host: { ngSkipHydration: 'true' },
  template: `
    <p-accordion [multiple]="true" [value]="open()" (valueChange)="change($event)">
      @for (s of seasons(); track s.number) {
        <p-accordion-panel [value]="s.number">
          <p-accordion-header>
            <span>{{ s.name || 'Season ' + s.number }}</span>
            <small class="ml-auto pr-3 text-sm font-normal text-fg-3">
              {{ s.episodeCount }} {{ s.episodeCount === 1 ? 'episode' : 'episodes' }}
            </small>
          </p-accordion-header>
          <p-accordion-content>
            <!-- Rendered (and so requested) only after the first opening, then kept. -->
            @if (seen().seen.has(s.number)) {
              <cv-episodes [tvId]="tvId()" [number]="s.number" />
            }
          </p-accordion-content>
        </p-accordion-panel>
      }
    </p-accordion>
  `,
})
export class SeasonsComponent {
  readonly tvId = input.required<number>();
  readonly seasons = input.required<TitleDetail['seasonList']>();

  // Like the mockup, the first season starts open.
  protected readonly open = linkedSignal(() =>
    this.seasons()
      .slice(0, 1)
      .map((s) => s.number),
  );
  // Every season opened so far (per title): an opened panel keeps its episodes when closed again.
  protected readonly seen = linkedSignal<
    { tvId: number; open: number[] },
    { tvId: number; seen: ReadonlySet<number> }
  >({
    source: () => ({ tvId: this.tvId(), open: this.open() }),
    computation: (src, prev) => ({
      tvId: src.tvId,
      seen: new Set([...(prev?.value.tvId === src.tvId ? prev.value.seen : []), ...src.open]),
    }),
  });

  protected change(value: unknown): void {
    const open = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(
      (v): v is number => typeof v === 'number',
    );
    this.open.set(open);
  }
}
