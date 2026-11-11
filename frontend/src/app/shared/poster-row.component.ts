import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';
import { TitleSummary } from '../core/models';
import { PosterCardComponent } from './poster-card.component';

/**
 * A heading and a horizontally scrolling row of posters. PrimeNG's Carousel in composition mode is
 * a native scroll-snap track (`autoSize` keeps the fixed poster widths of the UX brief), which is
 * the mockup's row behaviour. Its legacy `numVisible` mode (deprecated in PrimeNG 22) pages by
 * transform and cannot scroll continuously or fade at the edges.
 */
@Component({
  selector: 'cv-poster-row',
  imports: [RouterLink, ButtonModule, CarouselModule, PosterCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="group/row [--gutter:1.5rem] md:[--gutter:2rem] xl:[--gutter:3rem]">
      <p-carousel #carousel [autoSize]="true" [spacing]="0" snapType="proximity">
        <div class="mb-2 flex items-center justify-between gap-4">
          <h2 class="text-h2 text-fg">{{ heading() }}</h2>
          <div class="flex items-center gap-2">
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
            @if (seeAllLink(); as link) {
              <a
                [routerLink]="link"
                class="inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-medium text-fg-3 transition-colors duration-150 hover:text-fg lg:min-h-10"
                >See all<i class="pi pi-angle-right" aria-hidden="true"></i
              ></a>
            }
          </div>
        </div>
        <!-- Full-bleed track: negative margin and padding use the page gutter, and the ends fade out. -->
        <p-carousel-content
          #track
          class="-mx-(--gutter) scroll-px-(--gutter) px-(--gutter) py-2 [scrollbar-width:none] mask-[linear-gradient(90deg,transparent_0,black_var(--gutter),black_calc(100%-var(--gutter)),transparent_100%)] [&::-webkit-scrollbar]:hidden"
          tabindex="0"
          role="region"
          [attr.aria-label]="heading()"
        >
          @for (t of items(); track t.mediaType + t.tmdbId) {
            <p-carousel-item class="pr-4 lg:pr-5">
              <cv-poster-card [title]="t" class="w-35 md:w-40 lg:w-44 xl:w-46" />
            </p-carousel-item>
          }
        </p-carousel-content>
      </p-carousel>
    </section>
  `,
})
export class PosterRowComponent {
  readonly heading = input.required<string>();
  readonly items = input.required<TitleSummary[]>();
  readonly seeAllLink = input<string[]>();

  private readonly track = viewChild.required('track', { read: ElementRef });
  private readonly win = inject(DOCUMENT).defaultView;

  /** Arrows move 85% of the visible width, like the mockup (the carousel's own next() moves one item). */
  protected scroll(dir: 1 | -1): void {
    const el: HTMLElement = this.track().nativeElement;
    const reduce = this.win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  }
}
