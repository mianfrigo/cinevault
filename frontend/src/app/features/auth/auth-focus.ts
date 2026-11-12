import { afterRenderEffect, Directive, ElementRef, inject, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

/**
 * `submission.onInvalid` handler: after a blocked submit, focus moves to the first control with an
 * error. `focusBoundControl()` would focus the bound host, which for `p-password` is a
 * non-focusable wrapper, so focus the native control inside it instead.
 */
export function focusFirstInvalid(form: FieldTree<unknown>): void {
  const first = form().errorSummary()[0]?.fieldTree as FieldTree<unknown> | undefined;
  const host = first?.().formFieldBindings()[0]?.element;
  const control = host?.matches(NATIVE) ? host : host?.querySelector<HTMLElement>(NATIVE);
  control?.focus();
}

const NATIVE = 'input, select, textarea, button';

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
