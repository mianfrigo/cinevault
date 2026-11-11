import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TitleSummary } from '../core/models';

@Component({
  selector: 'cv-poster-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="group relative">
      <a [routerLink]="['/title', title().mediaType, title().tmdbId]" class="block">
        <div
          class="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 ring-1 ring-white/10 ring-inset transition duration-200 ease-out-expo group-focus-within:scale-[1.02] group-focus-within:brightness-110 group-hover:scale-[1.02] group-hover:brightness-110"
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
      <div
        class="absolute top-0 right-0 z-10 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <ng-content select="[heart]" />
      </div>
    </div>
  `,
})
export class PosterCardComponent {
  readonly title = input.required<TitleSummary>();

  protected readonly alt = computed(() => {
    const t = this.title();
    return t.year === null ? t.title : `${t.title} (${t.year})`;
  });
}
