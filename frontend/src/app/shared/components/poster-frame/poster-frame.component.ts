import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The 2:3 poster tile: the image, or the title on a plain field when there is none. The caller sizes
 * it (width) and may add effects with classes on the host. `overlayRing` draws the hairline over the
 * image (the title page); without it the ring sits on the frame itself, under the image.
 */
@Component({
  selector: 'cv-poster-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block aspect-[2/3] overflow-hidden rounded-md bg-surface-2',
    '[class]': 'ringClass()',
  },
  template: `
    @if (src(); as url) {
      <img
        [src]="url"
        [alt]="alt() ?? title()"
        [attr.loading]="eager() ? null : 'lazy'"
        [attr.fetchpriority]="eager() ? 'high' : null"
        class="size-full object-cover"
      />
    } @else {
      <div
        class="grid size-full place-items-center bg-surface-3 p-3 text-center text-sm font-medium text-fg-2"
      >
        {{ title() }}
      </div>
    }
    @if (overlayRing()) {
      <div
        aria-hidden="true"
        class="absolute inset-0 rounded-[inherit] ring-1 ring-line ring-inset"
      ></div>
    }
  `,
})
export class PosterFrameComponent {
  /** The poster image; none shows the title instead. */
  readonly src = input<string | null | undefined>();
  /** Shown when there is no image, and the image's alt text unless `alt` is given. */
  readonly title = input.required<string>();
  readonly alt = input<string>();
  /** The image is the page's main picture: no lazy loading and a high fetch priority. */
  readonly eager = input(false);
  readonly overlayRing = input(false);

  protected readonly ringClass = computed(() =>
    this.overlayRing() ? '' : 'ring-1 ring-line ring-inset',
  );
}
