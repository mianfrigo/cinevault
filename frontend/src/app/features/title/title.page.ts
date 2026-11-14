import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { CatalogService } from '@core/catalog/catalog.service';
import { ConfigService } from '@core/config/config.service';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { SeoService, pageTitle } from '@core/seo/seo.service';
import { ResponseStatus } from '@core/ssr/response-status.service';
import { MediaTypeParam, TitleDetail } from '@core/models';
import NotFoundComponent from '../../pages/not-found.component';
import { InitialsPipe } from '@shared/pipes/initials.pipe';
import { plural } from '@shared/utils/plural';
import { PosterFrameComponent } from '@shared/components/poster-frame/poster-frame.component';
import { backdropSrcset } from '@shared/utils/tmdb-image';
import { mediaTypeLabel, titleAlt } from '@shared/utils/title-format';
import { PosterRowComponent } from '@shared/components/poster-row/poster-row.component';
import { ScoreComponent } from '@shared/components/score/score.component';
import { SectionHeaderComponent } from '@shared/components/section-header/section-header.component';
import { StateBlockComponent } from '@shared/components/state-block/state-block.component';
import { SeasonsComponent } from './seasons.component';

/** The HTTP status behind a resource error (the resource may wrap the original error). */
function httpStatus(error: unknown): number | undefined {
  if (error instanceof HttpErrorResponse) return error.status;
  return error instanceof Error && error.cause ? httpStatus(error.cause) : undefined;
}

/** 136 -> "2h 16m", 45 -> "45m". */
function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "en" -> "English"; the code itself when it has no name. */
function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Runtime for a movie, "N seasons" for a series; empty when unknown. */
function lengthOf(t: TitleDetail): string {
  if (t.mediaType === 'tv') {
    return t.seasons ? `${t.seasons} ${plural(t.seasons, 'season')}` : '';
  }
  return t.runtimeMinutes ? formatRuntime(t.runtimeMinutes) : '';
}

/** The facts list; a fact TMDB has no value for is left out. */
function factsOf(t: TitleDetail, typeName: string, length: string): [string, string][] {
  const tv = t.mediaType === 'tv';
  const rows: [string, string | null][] = [
    ['Type', typeName],
    [tv ? 'Created by' : 'Director', t.director],
    ['Original language', t.originalLanguage ? languageName(t.originalLanguage) : null],
    ['Status', t.status],
    [tv ? 'First aired' : 'Release year', t.year === null ? null : String(t.year)],
    [tv ? 'Seasons' : 'Runtime', length || null],
    ['TMDB score', t.rating === null ? null : `${t.rating.toFixed(1)} / 10`],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}

/** /title/:type/:id. The route supplies `type` and `id` through component input binding. */
@Component({
  selector: 'cv-title',
  imports: [
    RouterLink,
    InitialsPipe,
    AvatarModule,
    ButtonModule,
    SkeletonModule,
    NotFoundComponent,
    PosterFrameComponent,
    PosterRowComponent,
    ScoreComponent,
    SeasonsComponent,
    SectionHeaderComponent,
    StateBlockComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Stable focus target: after Retry the button is gone, so focus moves here instead of to the body. -->
    <div #page tabindex="-1">
      @if (!request()) {
        <cv-not-found />
      } @else if (vm(); as v) {
        @let t = v.title;
        <article>
          <div class="relative isolate">
            <div
              aria-hidden="true"
              class="absolute inset-x-0 top-0 -z-10 h-90 overflow-hidden md:h-130"
            >
              @if (t.backdropUrl) {
                <img
                  [src]="t.backdropUrl"
                  [attr.srcset]="v.backdropSrcset"
                  sizes="100vw"
                  alt=""
                  fetchpriority="high"
                  class="size-full object-cover opacity-80"
                />
              }
              <div class="title-scrim absolute inset-0"></div>
            </div>
            <div class="site-gutter">
              <div
                class="grid grid-cols-[7rem_1fr] items-end gap-4 pt-32 md:grid-cols-[14.5rem_1fr] md:grid-rows-[auto_auto] md:gap-x-8 md:gap-y-0 md:pt-56"
              >
                <cv-poster-frame
                  class="md:col-start-1 md:row-span-2 md:row-start-1 md:self-end"
                  [src]="t.posterUrl"
                  [title]="t.title"
                  [alt]="v.alt"
                  [eager]="true"
                  [overlayRing]="true"
                />

                <div class="min-w-0 md:col-start-2 md:row-start-1 md:self-end">
                  <h1 class="text-title font-semibold text-fg">{{ t.title }}</h1>
                  <div data-testid="meta" class="meta-row mt-3 md:mt-4 md:text-base">
                    @if (t.rating !== null) {
                      <cv-score [value]="t.rating" />
                    }
                    @if (t.year !== null) {
                      <span>{{ t.year }}</span>
                    }
                    @if (v.length; as len) {
                      <span>{{ len }}</span>
                    }
                    <span>{{ v.typeName }}</span>
                  </div>
                  @if (t.genres.length) {
                    <ul class="meta-row mt-1 md:text-base">
                      @for (g of t.genres; track g.id) {
                        <li>
                          <a
                            [routerLink]="['/genre', t.mediaType, g.id]"
                            class="text-fg-2 underline decoration-transparent underline-offset-4 transition-colors duration-150 hover:text-fg hover:decoration-current"
                            >{{ g.name }}</a
                          >
                        </li>
                      }
                    </ul>
                  }
                </div>

                <div
                  class="col-span-2 mt-2 grid grid-cols-2 items-start gap-2 md:col-span-1 md:col-start-2 md:row-start-2 md:mt-6 md:flex md:flex-wrap md:self-start"
                >
                  @if (t.trailerUrl) {
                    <a
                      pButton
                      [href]="t.trailerUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="w-full md:w-auto"
                    >
                      <i class="pi pi-play" aria-hidden="true"></i>
                      <span>Watch trailer<span class="sr-only"> (opens in a new tab)</span></span>
                    </a>
                  }
                  <p-button
                    [label]="saved() ? 'In My List' : 'Add to My List'"
                    [icon]="saved() ? 'pi pi-heart-fill' : 'pi pi-heart'"
                    severity="secondary"
                    variant="outlined"
                    [pt]="listPt()"
                    (onClick)="toggleSaved(t)"
                  />
                  @if (downloadEnabled()) {
                    <div class="col-span-2 grid gap-2 md:col-auto md:justify-items-start">
                      <p-button
                        label="Download"
                        icon="pi pi-download"
                        severity="secondary"
                        variant="outlined"
                        [pt]="downloadPt"
                        (onClick)="downloadSoon()"
                      />
                      <small id="download-note" class="text-micro text-fg-3"
                        >Hidden in production</small
                      >
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>

          <div
            class="site-gutter mt-12 grid gap-12 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16"
          >
            <div class="min-w-0 [&>section+section]:mt-12">
              <section>
                <cv-section-header class="mb-4" heading="Overview" />
                <p class="max-w-[66ch] text-lg leading-[1.65] text-fg-2">
                  {{ t.overview || 'No overview available.' }}
                </p>
              </section>

              @if (t.cast.length) {
                <section>
                  <cv-section-header class="mb-4" heading="Top cast" />
                  <ul data-testid="cast" class="grid gap-x-8 sm:grid-cols-2">
                    @for (c of t.cast; track $index) {
                      <li class="flex items-center gap-3 border-t border-line-soft py-3">
                        <p-avatar [label]="c.name | initials" shape="circle" aria-hidden="true" />
                        <span class="min-w-0">
                          <b class="block text-sm leading-snug font-medium">{{ c.name }}</b>
                          @if (c.character) {
                            <small class="block text-label leading-snug text-fg-3">{{
                              c.character
                            }}</small>
                          }
                        </span>
                      </li>
                    }
                  </ul>
                </section>
              }

              @if (t.mediaType === 'tv' && t.seasonList.length) {
                <section>
                  <cv-section-header class="mb-4" heading="Seasons &amp; episodes" />
                  <cv-seasons [tvId]="t.tmdbId" [seasons]="t.seasonList" />
                </section>
              }
            </div>

            <aside>
              <h2 class="sr-only">Facts</h2>
              <dl data-testid="facts" class="self-start border-b border-line-soft">
                @for (f of v.facts; track f[0]) {
                  <div class="flex justify-between gap-4 border-t border-line-soft py-3 text-sm">
                    <dt class="text-fg-3">{{ f[0] }}</dt>
                    <dd class="text-right text-fg tabular-nums">{{ f[1] }}</dd>
                  </div>
                }
              </dl>
            </aside>
          </div>

          @if (t.similar.length) {
            <div class="site-gutter mt-12 pb-6 lg:mt-16">
              <cv-poster-row heading="More like this" [items]="t.similar" />
            </div>
          }
        </article>
      } @else if (notFound()) {
        <cv-not-found />
      } @else if (detail.error()) {
        <section class="site-gutter py-16">
          <cv-state
            kind="error"
            message="Could not load this title. Check your connection and try again."
            (retry)="retry()"
          />
        </section>
      } @else {
        <section
          role="status"
          aria-busy="true"
          class="site-gutter grid grid-cols-[7rem_1fr] items-end gap-4 pt-32 md:grid-cols-[14.5rem_1fr] md:gap-x-8 md:pt-56"
        >
          <span class="sr-only">Loading</span>
          <p-skeleton class="aspect-[2/3]" height="auto" />
          <div class="grid gap-3">
            <p-skeleton width="70%" height="2.5rem" />
            <p-skeleton width="45%" height="1rem" />
          </div>
          <div class="col-span-2 grid gap-3 pt-6 md:col-span-1 md:col-start-2">
            <p-skeleton height="1rem" />
            <p-skeleton width="80%" height="1rem" />
          </div>
        </section>
      }
    </div>
  `,
})
export default class TitlePage {
  private readonly catalog = inject(CatalogService);
  private readonly favorites = inject(FavoritesStore);
  private readonly messages = inject(MessageService);
  private readonly config = inject(ConfigService);
  private readonly seo = inject(SeoService);
  private readonly response = inject(ResponseStatus);
  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');

  // Route inputs. They come from the URL, so they are untrusted and validated in `request`.
  readonly type = input<unknown>();
  readonly id = input<unknown>();

  /** What to ask the API for, or undefined for a route that names no such title (no request is made). */
  protected readonly request = computed(() => {
    const type = this.type();
    if (type !== 'movie' && type !== 'tv') return undefined;
    const raw = this.id();
    const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0;
    return Number.isSafeInteger(id) && id >= 1 ? { type: type as MediaTypeParam, id } : undefined;
  });

  // Not kept between titles: another title replaces the whole page, so a skeleton shows meanwhile.
  protected readonly detail = rxResource({
    params: this.request,
    stream: ({ params }) => this.catalog.detail(params.type, params.id),
  });

  // value() throws while the resource is in error, so it is only read behind hasValue().
  protected readonly notFound = computed(() => httpStatus(this.detail.error()) === 404);
  protected readonly downloadEnabled = computed(() => this.config.features().downloadButton);

  /** What the template shows of the loaded title, derived once (null until there is one). */
  protected readonly vm = computed(() => {
    if (!this.detail.hasValue()) return null;
    const title = this.detail.value();
    const typeName = mediaTypeLabel(title.mediaType);
    const length = lengthOf(title);
    return {
      title,
      alt: titleAlt(title),
      backdropSrcset: backdropSrcset(title.backdropUrl),
      typeName,
      length,
      facts: factsOf(title, typeName, length),
    };
  });

  protected readonly saved = computed(() => {
    const req = this.request();
    return !!req && this.favorites.isFavorite(req.type, req.id);
  });

  // p-button only forwards ariaLabel; aria-pressed and the width reach the inner <button> through pt.
  protected readonly listPt = computed(() => ({
    root: { 'aria-pressed': String(this.saved()), class: 'w-full md:w-auto' },
  }));
  // The dashed border and muted text need `!`: the PrimeNG layer is declared after the utilities.
  protected readonly downloadPt = {
    root: {
      'aria-describedby': 'download-note',
      class: 'w-full md:w-auto !border-dashed !text-fg-2',
    },
  };

  constructor() {
    // The head follows the loaded title. "Not found" sets its own (cv-not-found); a failed load is unavailable.
    effect(() => {
      const v = this.vm();
      if (v) {
        const t = v.title;
        this.seo.set({
          title: pageTitle(v.alt),
          description: t.overview || `Overview, cast and similar titles for ${v.alt} on Cinevault.`,
          image: t.backdropUrl || t.posterUrl,
          path: `/title/${t.mediaType}/${t.tmdbId}`,
          type: t.mediaType === 'tv' ? 'video.tv_show' : 'video.movie',
        });
      } else if (this.detail.error() && !this.notFound()) {
        // The primary content failed (API or TMDB down): a temporary failure, never cached.
        this.response.set(503);
        this.seo.set({ title: pageTitle('Title unavailable'), noindex: true });
      }
    });
  }

  protected toggleSaved(t: TitleDetail): void {
    // A failed API call is already undone by the store; the label flipping back is the signal.
    this.favorites.toggle(t.mediaType, t.tmdbId).catch(() => undefined);
  }

  protected downloadSoon(): void {
    this.messages.add({ severity: 'secondary', summary: 'Download is coming soon', life: 4000 });
  }

  protected retry(): void {
    this.page().nativeElement.focus();
    this.detail.reload();
  }
}
