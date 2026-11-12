import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { CatalogService } from '../../core/catalog/catalog.service';
import { PosterRowComponent, RowItemDirective } from '../../shared/poster-row.component';
import { StateBlockComponent } from '../../shared/state-block.component';
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

// Tile size shared by the real tiles and the skeleton so the row never shifts (mockup: 5:3, 168-224px wide).
const TILE_WIDTH = 'clamp(10.5rem, 44vw, 14rem)';
const TILE = 'aspect-[5/3] w-[clamp(10.5rem,44vw,14rem)] shrink-0';

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
    RouterLink,
    SkeletonModule,
    HeroComponent,
    PosterRowComponent,
    RowItemDirective,
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

        @if (genres.hasValue()) {
          @if (popularGenres().length) {
            <cv-poster-row
              heading="Popular genres"
              [items]="popularGenres()"
              [trackKey]="genreId"
              [seeAllLink]="['/movies']"
            >
              <ng-template [cvRowItem]="popularGenres()" let-g>
                <a
                  [routerLink]="['/genre', 'movie', g.id]"
                  class="group/tile relative isolate flex items-end overflow-hidden rounded-md p-4 transition-[filter] duration-200 ease-out-expo after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:ring-1 after:ring-line after:ring-inset hover:brightness-110"
                  [class]="g.tone + ' ' + tile"
                >
                  @if (g.coverUrl && cover()[g.id] !== 'failed') {
                    <!-- Decorative cover over the tonal field: tone tint, then a scrim for the label. Hidden until loaded so the tone is the loading state. -->
                    <span
                      class="absolute inset-0 -z-10 bg-inherit transition-opacity duration-500 ease-out-expo motion-reduce:transition-none"
                      [class.opacity-0]="cover()[g.id] !== 'loaded'"
                    >
                      <img
                        [src]="g.coverUrl"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        class="size-full object-cover"
                        [attr.data-cover]="g.id"
                        (load)="mark(g.id, 'loaded')"
                        (error)="mark(g.id, 'failed')"
                      />
                      <span class="absolute inset-0 bg-inherit opacity-50"></span>
                      <span class="tile-scrim absolute inset-0"></span>
                    </span>
                  }
                  <span
                    class="text-base leading-tight font-medium"
                    [attr.aria-hidden]="g.label !== g.name || null"
                    >{{ g.label }}</span
                  >
                  @if (g.label !== g.name) {
                    <span class="sr-only">{{ g.name }}</span>
                  }
                  <i
                    class="pi pi-arrow-up-right absolute top-4 right-4 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-90 group-focus-visible/tile:opacity-90"
                    aria-hidden="true"
                  ></i>
                </a>
              </ng-template>
            </cv-poster-row>
          }
        } @else {
          <section>
            <!-- Same header and track metrics as the loaded row, so nothing moves when it arrives. -->
            <div class="mb-2 flex min-h-11 items-center lg:min-h-10">
              <h2 class="text-h2 text-fg">Popular genres</h2>
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  protected readonly tile = TILE;
  protected readonly tileWidth = TILE_WIDTH;
  protected readonly genreId = (g: { id: number }) => g.id;
  protected readonly skeletonTiles = [0, 1, 2, 3, 4, 5, 6, 7];

  // Per-genre cover state. A browser without it (SSR, before hydration) shows the tonal field.
  protected readonly cover = signal<Record<number, 'loaded' | 'failed'>>({});

  constructor() {
    // A cover can settle before hydration attaches its listeners (or before a re-created tile gets
    // them), and the browser never replays load/error: read the img state after every genre render.
    afterRenderEffect(() => {
      this.popularGenres();
      this.host.nativeElement
        .querySelectorAll<HTMLImageElement>('img[data-cover]')
        .forEach((img) => {
          const id = Number(img.dataset['cover']);
          if (img.complete && !this.cover()[id])
            this.mark(id, img.naturalWidth ? 'loaded' : 'failed');
        });
    });
  }

  protected mark(id: number, state: 'loaded' | 'failed') {
    this.cover.update((c) => ({ ...c, [id]: state }));
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
