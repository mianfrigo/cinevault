import { afterRenderEffect, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Focuses its host (an error banner) whenever the bound value changes, so a server error that
 * appears after a submit is announced and reachable. A new object per error re-triggers it.
 */
@Directive({ selector: '[cvFocusOn]', host: { tabindex: '-1' } })
export class FocusOnDirective {
  readonly cvFocusOn = input.required<unknown>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // afterRenderEffect never runs on the server.
    afterRenderEffect(() => {
      this.cvFocusOn();
      host.focus();
    });
  }
}
