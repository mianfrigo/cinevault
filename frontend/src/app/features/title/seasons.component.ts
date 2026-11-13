import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { TitleDetail } from '@core/models';
import { plural } from '@shared/utils/plural';
import { EpisodesComponent } from './episodes.component';

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
      @for (s of seasonRows(); track s.number) {
        <p-accordion-panel [value]="s.number">
          <p-accordion-header>
            <span>{{ s.label }}</span>
            <small class="ml-auto pr-3 text-sm font-normal text-fg-3">
              {{ s.episodeCount }} {{ s.episodeNoun }}
            </small>
          </p-accordion-header>
          <p-accordion-content>
            <!-- Rendered (and so requested) only after the first opening, then kept. -->
            @if (s.opened) {
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

  /** Each season with its label, episode noun and whether it was opened yet, so the template calls nothing. */
  protected readonly seasonRows = computed(() => {
    const { seen } = this.seen();
    return this.seasons().map((s) => ({
      number: s.number,
      label: s.name || 'Season ' + s.number,
      episodeCount: s.episodeCount,
      episodeNoun: plural(s.episodeCount, 'episode'),
      opened: seen.has(s.number),
    }));
  });

  protected change(value: unknown): void {
    const open = (Array.isArray(value) ? value : value == null ? [] : [value]).filter(
      (v): v is number => typeof v === 'number',
    );
    this.open.set(open);
  }
}
