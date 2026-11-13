import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';
import { TitleSummary } from '@core/models';
import { PosterCardComponent } from '@shared/components/poster-card/poster-card.component';
import { SectionHeaderComponent } from '@shared/components/section-header/section-header.component';
import { RowItemDirective } from '@shared/directives/row-item.directive';

/**
 * A heading and a horizontally scrolling row of posters. PrimeNG's Carousel in composition mode is
 * a native scroll-snap track (`autoSize` keeps the fixed poster widths of the UX brief), which is
 * the mockup's row behaviour. Its legacy `numVisible` mode (deprecated in PrimeNG 22) pages by
 * transform and cannot scroll continuously or fade at the edges.
 *
 * Give it a `cvRowItem` template to render something other than a poster (the Home genre
 * tiles) and a `trackKey` to identify items; without them it renders poster cards keyed by title.
 */
@Component({
  selector: 'cv-poster-row',
  imports: [
    NgTemplateOutlet,
    ButtonModule,
    CarouselModule,
    PosterCardComponent,
    SectionHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="group/row [--gutter:1.5rem] md:[--gutter:2rem] xl:[--gutter:3rem]">
      <p-carousel #carousel [autoSize]="true" [spacing]="0" snapType="proximity">
        <cv-section-header class="mb-2" [heading]="heading()" [link]="seeAllLink()">
          <div
            class="hidden gap-1 opacity-0 transition-opacity duration-200 group-focus-within/row:opacity-100 group-hover/row:opacity-100 md:pointer-fine:flex"
          >
            <p-button
              icon="pi pi-chevron-left"
              severity="secondary"
              variant="outlined"
              size="small"
              [ariaLabel]="'Scroll ' + heading() + ' left'"
              [disabled]="carousel.isPrevDisabled()"
              (onClick)="scroll(-1)"
            />
            <p-button
              icon="pi pi-chevron-right"
              severity="secondary"
              variant="outlined"
              size="small"
              [ariaLabel]="'Scroll ' + heading() + ' right'"
              [disabled]="carousel.isNextDisabled()"
              (onClick)="scroll(1)"
            />
          </div>
        </cv-section-header>
        <!-- Full-bleed track: negative margin and padding use the page gutter, and the ends fade out. -->
        <p-carousel-content
          #track
          class="-mx-(--gutter) scroll-px-(--gutter) px-(--gutter) py-2 [scrollbar-width:none] mask-[linear-gradient(90deg,transparent_0,black_var(--gutter),black_calc(100%-var(--gutter)),transparent_100%)] [&::-webkit-scrollbar]:hidden"
          tabindex="0"
          role="region"
          [attr.aria-label]="heading()"
        >
          @for (row of rows(); track trackKey()(row.item)) {
            <p-carousel-item class="pr-4 lg:pr-5">
              @if (itemTemplate(); as item) {
                <ng-container *ngTemplateOutlet="item.template; context: { $implicit: row.item }" />
              } @else {
                <cv-poster-card [title]="row.poster" class="w-35 md:w-40 lg:w-44 xl:w-46" />
              }
            </p-carousel-item>
          }
        </p-carousel-content>
      </p-carousel>
    </section>
  `,
})
export class PosterRowComponent<T = TitleSummary> {
  readonly heading = input.required<string>();
  readonly items = input.required<readonly T[]>();
  readonly itemTemplate = contentChild(RowItemDirective);
  /** Stable identity per item; defaults to the title's media type and TMDB id (poster rows). */
  readonly trackKey = input<(item: T) => string | number>((t) => {
    const { mediaType, tmdbId } = t as unknown as TitleSummary;
    return mediaType + tmdbId;
  });
  readonly seeAllLink = input<string[]>();

  private readonly track = viewChild.required('track', { read: ElementRef });
  private readonly win = inject(DOCUMENT).defaultView;

  /** Each item with its title view (without an item template the items are titles). */
  protected readonly rows = computed(() =>
    this.items().map((item) => ({ item, poster: item as unknown as TitleSummary })),
  );

  /** Arrows move 85% of the visible width, like the mockup (the carousel's own next() moves one item). */
  protected scroll(dir: 1 | -1): void {
    const el: HTMLElement = this.track().nativeElement;
    const reduce = this.win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  }
}
