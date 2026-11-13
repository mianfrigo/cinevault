import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';

/**
 * The page title block: the page's h1, an optional lead line under it, and an `[slot=actions]` area
 * beside it (below it on a phone). The h1 is focusable by script (`tabindex="-1"`) so a page can send
 * keyboard focus back to it with `focus()` after the control that held it is gone.
 */
@Component({
  selector: 'cv-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `title` is also a native attribute: a static `title="..."` must not show as a tooltip on the host.
  host: { class: 'block', '[attr.title]': 'null' },
  template: `
    <header
      class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      [class]="compact() ? 'mb-6 md:mb-8' : 'mb-8'"
    >
      <div class="min-w-0 md:flex-1">
        <h1 #heading tabindex="-1" class="text-h1 break-words text-fg outline-none">
          {{ title() }}
        </h1>
        @if (lead() !== undefined) {
          <!-- min-h keeps the line's place while the text is not known yet (a lead of ''). -->
          <p class="mt-2 min-h-5 text-sm text-fg-3 tabular-nums">{{ lead() }}</p>
        }
      </div>
      <ng-content select="[slot=actions]" />
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  /** The line under the title. Omit it for no line; an empty string keeps the line's height (text still loading). */
  readonly lead = input<string>();
  /** Tighter space below on a phone (6 instead of 8): the list pages. */
  readonly compact = input(false, { transform: booleanAttribute });

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  /** Moves keyboard focus to the h1. */
  focus(): void {
    this.heading().nativeElement.focus();
  }
}
