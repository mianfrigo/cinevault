import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { FavoritesStore } from '../core/favorites/favorites.store';
import { TitleSummary } from '../core/models';

@Component({
  selector: 'cv-poster-card',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="group relative">
      <a [routerLink]="['/title', title().mediaType, title().tmdbId]" class="block">
        <div
          class="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 ring-1 ring-line ring-inset transition duration-200 ease-out-expo group-focus-within:scale-[1.02] group-focus-within:brightness-110 group-hover:scale-[1.02] group-hover:brightness-110"
        >
          @if (title().posterUrl; as src) {
            <img [src]="src" [alt]="alt()" loading="lazy" class="size-full object-cover" />
          } @else {
            <div
              class="grid size-full place-items-center bg-surface-3 p-3 text-center text-sm font-medium text-fg-2"
            >
              {{ title().title }}
            </div>
          }
        </div>
        <p class="mt-3 truncate text-sm leading-tight font-medium text-fg">{{ title().title }}</p>
        @if (title().year !== null) {
          <p class="mt-0.5 text-label text-fg-3 tabular-nums">{{ title().year }}</p>
        }
      </a>
      <!-- The button is the 44px target (top-right corner); only the 32px chip inside is drawn. -->
      <p-button
        class="absolute top-0 right-0 z-10 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        [class.opacity-0]="!saved()"
        [text]="true"
        severity="secondary"
        [icon]="saved() ? 'pi pi-heart-fill' : 'pi pi-heart'"
        [ariaLabel]="
          (saved() ? 'Remove ' : 'Add ') + title().title + (saved() ? ' from' : ' to') + ' My List'
        "
        [pt]="heartAttrs()"
        (onClick)="toggle()"
      />
    </div>
  `,
})
export class PosterCardComponent {
  private readonly favorites = inject(FavoritesStore);

  readonly title = input.required<TitleSummary>();

  protected readonly saved = computed(() =>
    this.favorites.isFavorite(this.title().mediaType, this.title().tmdbId),
  );

  protected readonly alt = computed(() => {
    const t = this.title();
    return t.year === null ? t.title : `${t.title} (${t.year})`;
  });

  // p-button only forwards ariaLabel; aria-pressed and the sizing reach the inner <button> through pt.
  protected readonly heartAttrs = computed(() => ({
    root: {
      'aria-pressed': String(this.saved()),
      class: 'size-11 !p-0',
    },
    icon: {
      class:
        'grid size-8 place-items-center rounded-md border border-line-strong bg-surface-1/60 text-fg backdrop-blur-sm',
    },
  }));

  protected toggle(): void {
    const t = this.title();
    // A failed API call is already undone by the store; the heart flipping back is the signal.
    this.favorites.toggle(t.mediaType, t.tmdbId).catch(() => undefined);
  }
}
