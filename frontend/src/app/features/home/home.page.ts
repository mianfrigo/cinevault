import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../core/catalog/catalog.service';
import { PosterRowComponent } from '../../shared/poster-row.component';
import { StateBlockComponent } from '../../shared/state-block.component';
import { HeroComponent } from './hero.component';

const HERO_SLIDES = 3;

// Tonal fields for the genre tiles, cycled by position; full class names so Tailwind finds them.
const TONES = [
  'bg-tone-dusk text-tone-dusk-fg',
  'bg-tone-clay text-tone-clay-fg',
  'bg-tone-plum text-tone-plum-fg',
  'bg-tone-sage text-tone-sage-fg',
  'bg-tone-slate text-tone-slate-fg',
  'bg-tone-ochre text-tone-ochre-fg',
  'bg-tone-teal text-tone-teal-fg',
  'bg-tone-bone text-tone-bone-fg',
];

@Component({
  selector: 'cv-home',
  imports: [NgTemplateOutlet, RouterLink, HeroComponent, PosterRowComponent, StateBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="sr-only">Cinevault: trending movies and series</h1>

    @if (trending.hasValue()) {
      <cv-hero [items]="heroItems()" />
    } @else if (trending.isLoading()) {
      <!-- Holds the hero's height so the rows do not jump when it arrives. -->
      <div aria-hidden="true" class="h-[580px] bg-surface-0 md:h-[clamp(520px,64vh,680px)]"></div>
    }

    <div class="mx-auto max-w-site px-6 pb-6 md:px-8 xl:px-12">
      <div class="mt-8 flex flex-col gap-12 lg:mt-10 lg:gap-16">
        <ng-container
          *ngTemplateOutlet="
            posters;
            context: { heading: 'Trending movies', data: trending, link: ['/movies'] }
          "
        />
        <ng-container
          *ngTemplateOutlet="
            posters;
            context: { heading: 'New release TV shows', data: newTv, link: ['/tv'] }
          "
        />

        <section>
          <h2 class="mb-4 text-h2 text-fg">Browse genres</h2>
          @if (genres.hasValue()) {
            <ul
              class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4 xl:grid-cols-6"
            >
              @for (g of genres.value(); track g.id; let i = $index) {
                <li>
                  <a
                    [routerLink]="['/genre', 'movie', g.id]"
                    class="group/tile relative flex aspect-[5/3] items-end rounded-md p-4 ring-1 ring-line transition-[filter] duration-200 ease-out-expo ring-inset hover:brightness-110"
                    [class]="tone(i)"
                  >
                    <span class="text-base leading-tight font-medium">{{ g.name }}</span>
                    <i
                      class="pi pi-arrow-up-right absolute top-4 right-4 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-90 group-focus-visible/tile:opacity-90"
                      aria-hidden="true"
                    ></i>
                  </a>
                </li>
              }
            </ul>
          } @else if (genres.error()) {
            <cv-state
              kind="error"
              message="Could not load genres. Check your connection and try again."
              (retry)="genres.reload()"
            />
          } @else {
            <cv-state kind="loading" />
          }
        </section>

        <ng-container
          *ngTemplateOutlet="
            posters;
            context: { heading: 'Top rated films', data: topRated, link: ['/movies'] }
          "
        />
      </div>
    </div>

    <ng-template #posters let-heading="heading" let-data="data" let-link="link">
      @if (data.hasValue()) {
        <cv-poster-row [heading]="heading" [items]="data.value().items" [seeAllLink]="link" />
      } @else {
        <section>
          <h2 class="mb-4 text-h2 text-fg">{{ heading }}</h2>
          @if (data.error()) {
            <cv-state
              kind="error"
              message="Could not load these titles. Check your connection and try again."
              (retry)="data.reload()"
            />
          } @else {
            <cv-state kind="loading" />
          }
        </section>
      }
    </ng-template>
  `,
})
export default class HomePage {
  private readonly catalog = inject(CatalogService);

  // Four independent read-only requests: one failing never blanks the page.
  protected readonly trending = rxResource({
    stream: () => this.catalog.list('trending', 'movie'),
  });
  protected readonly newTv = rxResource({ stream: () => this.catalog.list('new', 'tv') });
  protected readonly topRated = rxResource({
    stream: () => this.catalog.list('top-rated', 'movie'),
  });
  protected readonly genres = rxResource({ stream: () => this.catalog.genres('movie') });

  protected readonly heroItems = computed(() =>
    (this.trending.value()?.items ?? []).filter((t) => t.backdropUrl).slice(0, HERO_SLIDES),
  );

  protected tone(i: number): string {
    return TONES[i % TONES.length];
  }
}
