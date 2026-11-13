import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/** What a tile shows: the genre, its short label, a tonal field (classes) and an optional cover. */
export interface GenreTile {
  id: number;
  name: string;
  coverUrl: string | null;
  label: string;
  tone: string;
}

/** Width of a tile, shared with the loading skeleton so the row never shifts (mockup: 5:3, 168-224px wide). */
export const TILE_WIDTH = 'clamp(10.5rem, 44vw, 14rem)';
const TILE = 'aspect-[5/3] w-[clamp(10.5rem,44vw,14rem)] shrink-0';

/**
 * A Home genre tile: a link on a tonal field, with the genre's cover over it once the image has
 * loaded (the tone is the loading state). A cover that fails to load is dropped.
 */
@Component({
  selector: 'cv-genre-tile',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <a
      [routerLink]="['/genre', 'movie', genre().id]"
      class="group/tile relative isolate flex items-end overflow-hidden rounded-md p-4 transition-[filter] duration-200 ease-out-expo after:pointer-events-none after:absolute after:inset-0 after:rounded-md after:ring-1 after:ring-line after:ring-inset hover:brightness-110"
      [class]="genre().tone + ' ' + tile"
    >
      @if (genre().coverUrl && cover() !== 'failed') {
        <!-- Decorative cover over the tonal field: tone tint, then a scrim for the label. Hidden until loaded so the tone is the loading state. -->
        <span
          class="absolute inset-0 -z-10 bg-inherit transition-opacity duration-500 ease-out-expo motion-reduce:transition-none"
          [class.opacity-0]="cover() !== 'loaded'"
        >
          <img
            [src]="genre().coverUrl"
            alt=""
            loading="lazy"
            decoding="async"
            class="size-full object-cover"
            [attr.data-cover]="genre().id"
            (load)="cover.set('loaded')"
            (error)="cover.set('failed')"
          />
          <span class="absolute inset-0 bg-inherit opacity-50"></span>
          <span class="tile-scrim absolute inset-0"></span>
        </span>
      }
      <span
        class="text-base leading-tight font-medium"
        [attr.aria-hidden]="genre().label !== genre().name || null"
        >{{ genre().label }}</span
      >
      @if (genre().label !== genre().name) {
        <span class="sr-only">{{ genre().name }}</span>
      }
      <i
        class="pi pi-arrow-up-right absolute top-4 right-4 opacity-0 transition-opacity duration-150 group-hover/tile:opacity-90 group-focus-visible/tile:opacity-90"
        aria-hidden="true"
      ></i>
    </a>
  `,
})
export class GenreTileComponent {
  readonly genre = input.required<GenreTile>();

  protected readonly tile = TILE;
  /** Cover state. Unset (SSR, before hydration, or not settled yet) shows the tonal field. */
  protected readonly cover = signal<'loaded' | 'failed' | undefined>(undefined);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // A cover can settle before hydration attaches its listeners (or before a re-created tile gets
    // them), and the browser never replays load/error: read the img state after every render.
    afterRenderEffect(() => {
      this.genre();
      const img = this.host.querySelector<HTMLImageElement>('img[data-cover]');
      if (img?.complete && !this.cover()) this.cover.set(img.naturalWidth ? 'loaded' : 'failed');
    });
  }
}
