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
