import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SkeletonModule } from 'primeng/skeleton';
import { CatalogService } from '@core/catalog/catalog.service';
import { SeoService } from '@core/seo/seo.service';
import { PosterRowComponent } from '@shared/components/poster-row/poster-row.component';
import { RowItemDirective } from '@shared/directives/row-item.directive';
import { SectionHeaderComponent } from '@shared/components/section-header/section-header.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { GenreTileComponent, TILE_WIDTH } from './genre-tile.component';
import { HeroComponent } from './hero.component';

const HERO_SLIDES = 3;

// Tonal fields for the genre tiles, cycled by position (mockup order); full class names so Tailwind finds them.
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

// TMDB has no genre popularity: a fixed list of well-known names, matched by name against the API.
const POPULAR = [
  'Science Fiction',
  'Action',
  'Drama',
  'Fantasy',
  'Thriller',
  'Comedy',
  'Adventure',
  'Animation',
  'Horror',
  'Romance',
  'Mystery',
  'Crime',
];
const SHORT_LABEL: Record<string, string> = { 'Science Fiction': 'Sci-Fi' };
const MAX_TILES = 10;
const MIN_CURATED = 6;

@Component({
  selector: 'cv-home',
  imports: [
    NgTemplateOutlet,
    SkeletonModule,
    GenreTileComponent,
    HeroComponent,
    PosterRowComponent,
    RowItemDirective,
    SectionHeaderComponent,
    StateBlockComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="sr-only">Cinevault: trending movies and series</h1>

    @if (trending.hasValue()) {
      <cv-hero [items]="heroItems()" />
    } @else if (trending.isLoading()) {
      <!-- Holds the hero's height so the rows do not jump when it arrives. -->
      <div aria-hidden="true" class="h-[580px] bg-surface-0 md:h-[clamp(520px,64vh,680px)]"></div>
    }

    <div class="site-gutter pb-6">
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

        @if (genres.hasValue()) {
          @if (popularGenres().length) {
            <cv-poster-row
              heading="Popular genres"
              [items]="popularGenres()"
              [trackKey]="genreId"
              [seeAllLink]="['/movies']"
            >
              <ng-template [cvRowItem]="popularGenres()" let-g>
                <cv-genre-tile [genre]="g" />
              </ng-template>
            </cv-poster-row>
          }
        } @else {
          <section>
            <!-- Same header and track metrics as the loaded row, so nothing moves when it arrives. -->
            <div class="mb-2 flex min-h-11 items-center lg:min-h-10">
              <h2 class="section-title">Popular genres</h2>
            </div>
            @if (genres.error()) {
              <cv-state
                kind="error"
                message="Could not load genres. Check your connection and try again."
                (retry)="genres.reload()"
              />
            } @else {
              <div role="status" aria-busy="true" class="flex gap-4 overflow-hidden py-2 lg:gap-5">
                <span class="sr-only">Loading</span>
                @for (n of skeletonTiles; track n) {
                  <p-skeleton
                    class="aspect-[5/3] shrink-0"
                    [width]="tileWidth"
                    height="auto"
                    borderRadius="6px"
                  />
                }
              </div>
            }
          </section>
        }

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
          <cv-section-header class="mb-4" [heading]="heading" />
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
  protected readonly genres = rxResource({
    stream: () => this.catalog.genreCovers('movie'),
  });

  protected readonly heroItems = computed(() =>
    (this.trending.value()?.items ?? []).filter((t) => t.backdropUrl).slice(0, HERO_SLIDES),
  );

  protected readonly tileWidth = TILE_WIDTH;
  protected readonly genreId = (g: { id: number }) => g.id;
  protected readonly skeletonTiles = [0, 1, 2, 3, 4, 5, 6, 7];

  constructor() {
    inject(SeoService).set({ title: 'Cinevault: discover movies and TV shows', path: '/' });
  }

  protected readonly popularGenres = computed(() => {
    const all = this.genres.hasValue() ? this.genres.value() : [];
    const byName = new Map(all.map((g) => [g.name, g]));
    const curated = POPULAR.flatMap((n) => byName.get(n) ?? []);
    return (curated.length >= MIN_CURATED ? curated : all).slice(0, MAX_TILES).map((g, i) => ({
      id: g.id,
      name: g.name,
      coverUrl: g.coverUrl,
      label: SHORT_LABEL[g.name] ?? g.name,
      tone: TONES[i % TONES.length],
    }));
  });
}
