import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { TitleSummary } from '@core/models';
import { ScoreComponent } from '@shared/components/score/score.component';
import { mediaTypeLabel } from '@shared/utils/title-format';

const SWIPE_PX = 50;

/**
 * Full-bleed hero carousel (UX brief section 4). Built from scratch, per the owner decision:
 * stacked slides that cross-fade, one thin progress bar per slide. The active bar's CSS animation
 * (7 s) is the autoplay clock: when it ends the next slide shows, so there is no timer to keep in
 * step with pause, and nothing runs on the server.
 */
@Component({
  selector: 'cv-hero',
  imports: [RouterLink, ButtonModule, ScoreComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (slides().length) {
      <section
        role="region"
        aria-roledescription="carousel"
        aria-label="Trending now"
        class="relative isolate h-[580px] overflow-hidden bg-surface-0 md:h-[clamp(520px,64vh,680px)]"
        (pointerenter)="onPointer($event, true)"
        (pointerleave)="onPointer($event, false)"
        (focusin)="focused.set(true)"
        (focusout)="focused.set(false)"
        (keydown.arrowleft)="step(-1)"
        (keydown.arrowright)="step(1)"
      >
        <div
          class="absolute inset-0 touch-pan-y"
          [attr.aria-live]="playing() && !held() ? 'off' : 'polite'"
          (pointerdown)="swipeStart($event)"
          (pointerup)="swipeEnd($event)"
          (pointercancel)="swipeX = null"
        >
          @for (
            row of slideRows();
            track row.t.mediaType + row.t.tmdbId;
            let i = $index;
            let first = $first
          ) {
            @let t = row.t;
            @let active = i === current();
            <article
              role="group"
              aria-roledescription="slide"
              [attr.aria-label]="i + 1 + ' of ' + slides().length"
              [attr.aria-hidden]="active ? null : 'true'"
              [attr.inert]="active ? null : ''"
              class="absolute inset-0 isolate transition-[opacity,visibility] duration-700 ease-out-expo"
              [class.opacity-0]="!active"
              [class.invisible]="!active"
            >
              <img
                [src]="t.backdropUrl"
                alt=""
                [attr.fetchpriority]="first ? 'high' : null"
                [attr.loading]="first ? null : 'lazy'"
                class="absolute inset-0 size-full object-cover transition-transform duration-[7000ms] ease-out-expo"
                [class.scale-105]="!active"
              />
              <div class="hero-scrim absolute inset-0"></div>
              <div class="site-gutter relative flex h-full items-end pb-18">
                <div class="max-w-[560px]">
                  <h2 class="text-hero font-semibold text-fg" [class.animate-hero-rise]="active">
                    {{ t.title }}
                  </h2>
                  <div
                    class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2 tabular-nums [&>*+*]:before:mr-2 [&>*+*]:before:inline-block [&>*+*]:before:size-0.5 [&>*+*]:before:rounded-full [&>*+*]:before:bg-current [&>*+*]:before:align-middle [&>*+*]:before:opacity-70"
                    [class.animate-hero-rise]="active"
                    [style.animation-delay.ms]="60"
                  >
                    @if (t.rating !== null) {
                      <cv-score [value]="t.rating" />
                    }
                    @if (t.year !== null) {
                      <span>{{ t.year }}</span>
                    }
                    <span>{{ row.typeName }}</span>
                  </div>
                  @if (t.overview) {
                    <p
                      class="mt-3 line-clamp-2 max-w-[52ch] text-fg-2"
                      [class.animate-hero-rise]="active"
                      [style.animation-delay.ms]="120"
                    >
                      {{ t.overview }}
                    </p>
                  }
                  <div
                    class="mt-6 flex flex-wrap gap-2"
                    [class.animate-hero-rise]="active"
                    [style.animation-delay.ms]="180"
                  >
                    <p-button label="Details" [routerLink]="['/title', t.mediaType, t.tmdbId]" />
                    <p-button
                      [label]="row.listLabel"
                      [icon]="row.listIcon"
                      severity="secondary"
                      variant="outlined"
                      [pt]="row.listPt"
                      (onClick)="toggleSaved(t)"
                    />
                  </div>
                </div>
              </div>
            </article>
          }
        </div>

        <div class="site-gutter absolute inset-x-0 bottom-3 z-10 flex items-center justify-between">
          <div class="flex gap-2" role="group" aria-label="Choose slide">
            @for (t of slides(); track t.mediaType + t.tmdbId; let i = $index) {
              <button
                type="button"
                class="relative h-11 w-10 lg:h-10"
                [attr.aria-label]="'Go to slide ' + (i + 1)"
                [attr.aria-current]="i === current() ? 'true' : null"
                (click)="go(i)"
              >
                <span
                  class="absolute inset-x-0 top-1/2 -mt-px h-0.5 rounded-[1px] bg-line-strong"
                ></span>
                <span
                  data-fill
                  class="absolute inset-x-0 top-1/2 -mt-px h-0.5 origin-left rounded-[1px] bg-fg"
                  [class.scale-x-0]="i > current() || (i === current() && motion() === 'unknown')"
                  [class.scale-x-100]="i < current() || (i === current() && activeFull())"
                  [class.animate-hero-fill]="i === current() && playing()"
                  [style.animation-play-state]="held() ? 'paused' : 'running'"
                  (animationend)="onBarEnd(i)"
                ></span>
              </button>
            }
          </div>
          <div class="flex items-center gap-1">
            <p-button
              class="hidden md:pointer-fine:block"
              icon="pi pi-chevron-left"
              severity="secondary"
              [text]="true"
              ariaLabel="Previous slide"
              (onClick)="step(-1)"
            />
            <p-button
              class="hidden md:pointer-fine:block"
              icon="pi pi-chevron-right"
              severity="secondary"
              [text]="true"
              ariaLabel="Next slide"
              (onClick)="step(1)"
            />
            @if (showPause()) {
              <p-button
                [icon]="paused() ? 'pi pi-play' : 'pi pi-pause'"
                severity="secondary"
                [text]="true"
                [ariaLabel]="
                  paused() ? 'Resume automatic slide change' : 'Pause automatic slide change'
                "
                [pt]="pausePt()"
                (onClick)="paused.set(!paused())"
              />
            }
          </div>
        </div>
      </section>
    }
  `,
})
export class HeroComponent {
  private readonly favorites = inject(FavoritesStore);

  readonly items = input.required<TitleSummary[]>();

  protected readonly slides = computed(() => this.items().filter((t) => t.backdropUrl));
  private readonly index = signal(0);
  protected readonly current = computed(() => Math.min(this.index(), this.slides().length - 1));

  /**
   * What the browser says about prefers-reduced-motion. 'unknown' on the server and until the first
   * browser render: the markup then matches the autoplay start (empty bar, pause button present), so
   * hydration does not make the bar jump from full to empty or the controls shift.
   */
  protected readonly motion = signal<'unknown' | 'ok' | 'reduced'>('unknown');
  protected readonly playing = computed(() => this.motion() === 'ok' && this.slides().length > 1);
  protected readonly showPause = computed(
    () => this.motion() !== 'reduced' && this.slides().length > 1,
  );
  /** The active bar is a static full bar when nothing counts down (reduced motion, one slide). */
  protected readonly activeFull = computed(
    () => this.motion() === 'reduced' || (this.motion() === 'ok' && this.slides().length < 2),
  );

  private readonly hovering = signal(false);
  protected readonly focused = signal(false);
  protected readonly paused = signal(false);
  protected readonly held = computed(() => this.hovering() || this.focused() || this.paused());

  // p-button only forwards ariaLabel; aria-pressed reaches the inner <button> through pt.
  protected readonly pausePt = computed(() => ({
    root: { 'aria-pressed': String(this.paused()) },
  }));
  /** Each slide with what its template shows, so the template calls nothing: type, My List label, icon and pt. */
  protected readonly slideRows = computed(() =>
    this.slides().map((t) => {
      const saved = this.favorites.isFavorite(t.mediaType, t.tmdbId);
      return {
        t,
        typeName: mediaTypeLabel(t.mediaType),
        listLabel: saved ? 'In My List' : 'My List',
        listIcon: saved ? 'pi pi-check' : 'pi pi-plus',
        listPt: { root: { 'aria-pressed': String(saved) } },
      };
    }),
  );

  protected swipeX: number | null = null;

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const query = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
      const sync = () => this.motion.set(query?.matches ? 'reduced' : 'ok');
      sync();
      query?.addEventListener('change', sync);
      destroyRef.onDestroy(() => query?.removeEventListener('change', sync));
    });
  }

  protected go(i: number): void {
    const n = this.slides().length;
    this.index.set(((i % n) + n) % n);
  }

  protected step(by: number): void {
    this.go(this.current() + by);
  }

  /** The active bar finished filling: the autoplay interval is over. */
  protected onBarEnd(i: number): void {
    if (this.playing() && i === this.current()) this.step(1);
  }

  protected onPointer(e: PointerEvent, inside: boolean): void {
    if (e.pointerType === 'mouse') this.hovering.set(inside);
  }

  protected swipeStart(e: PointerEvent): void {
    if (e.pointerType === 'touch') this.swipeX = e.clientX;
  }

  protected swipeEnd(e: PointerEvent): void {
    if (this.swipeX === null) return;
    const dx = e.clientX - this.swipeX;
    this.swipeX = null;
    if (Math.abs(dx) > SWIPE_PX) this.step(dx < 0 ? 1 : -1);
  }

  protected toggleSaved(t: TitleSummary): void {
    this.favorites.toggle(t.mediaType, t.tmdbId).catch(() => undefined);
  }
}
