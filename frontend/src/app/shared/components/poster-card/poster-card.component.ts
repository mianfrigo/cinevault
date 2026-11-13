import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { TitleSummary } from '@core/models';
import { PosterFrameComponent } from '@shared/components/poster-frame/poster-frame.component';
import { ScoreComponent } from '@shared/components/score/score.component';
import { titleAlt, titleMeta } from '@shared/utils/title-format';

@Component({
  selector: 'cv-poster-card',
  imports: [RouterLink, ButtonModule, PosterFrameComponent, ScoreComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="group relative">
      <a [routerLink]="['/title', title().mediaType, title().tmdbId]" class="block">
        <cv-poster-frame
          class="transition duration-200 ease-out-expo group-focus-within:scale-[1.02] group-focus-within:brightness-110 group-hover:scale-[1.02] group-hover:brightness-110"
          [src]="title().posterUrl"
          [title]="title().title"
          [alt]="alt()"
        />
        <p class="mt-3 truncate text-sm leading-tight font-medium text-fg">{{ title().title }}</p>
        @if (detailed()) {
          <!-- Mockup .card-meta: "year · type" at the left, the score at the right. -->
          <div
            data-meta
            class="mt-0.5 flex items-center justify-between gap-2 text-label whitespace-nowrap text-fg-3 tabular-nums"
          >
            <span class="truncate">{{ meta() }}</span>
            <cv-score class="shrink-0 text-fg-2" [value]="title().rating" />
          </div>
        } @else if (title().year !== null) {
          <p class="mt-0.5 text-label text-fg-3 tabular-nums">{{ title().year }}</p>
        }
      </a>
      <!-- The button is the 44px target (top-right corner); only the 32px chip inside is drawn. -->
      <p-button
        class="absolute top-0 right-0 z-10 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        [class.opacity-0]="removable() || !saved()"
        [class.max-md:opacity-100]="removable()"
        [text]="true"
        severity="secondary"
        [icon]="removable() ? 'pi pi-times' : saved() ? 'pi pi-heart-fill' : 'pi pi-heart'"
        [ariaLabel]="label()"
        [pt]="heartAttrs()"
        (onClick)="toggle()"
      />
    </div>
  `,
})
export class PosterCardComponent {
  private readonly favorites = inject(FavoritesStore);

  readonly title = input.required<TitleSummary>();
  /** The corner button removes the title from the user's favorites (emits `removed`) instead of toggling the heart. */
  readonly removable = input(false);
  readonly removed = output<void>();
  /** Adds the mockup's meta line under the title: "year · Movie" and the score. Off for the plain rows. */
  readonly detailed = input(false);

  protected readonly saved = computed(() =>
    this.favorites.isFavorite(this.title().mediaType, this.title().tmdbId),
  );

  protected readonly alt = computed(() => titleAlt(this.title()));

  protected readonly meta = computed(() => titleMeta(this.title()));

  protected readonly label = computed(() => {
    const name = this.title().title;
    if (this.removable()) return `Remove ${name} from favorites`;
    return this.saved() ? `Remove ${name} from My List` : `Add ${name} to My List`;
  });

  // p-button only forwards ariaLabel; aria-pressed and the sizing reach the inner <button> through pt.
  protected readonly heartAttrs = computed(() => ({
    root: {
      'aria-pressed': this.removable() ? null : String(this.saved()),
      class: 'size-11 !p-0',
    },
    icon: {
      class:
        'grid size-8 place-items-center rounded-md border border-line-strong bg-surface-1/60 text-fg backdrop-blur-sm',
    },
  }));

  protected toggle(): void {
    if (this.removable()) return this.removed.emit();
    const t = this.title();
    // A failed API call is already undone by the store; the heart flipping back is the signal.
    this.favorites.toggle(t.mediaType, t.tmdbId).catch(() => undefined);
  }
}
