import type { FieldTree } from '@angular/forms/signals';

/**
 * `submission.onInvalid` handler: after a blocked submit, focus moves to the first control with an
 * error. `focusBoundControl()` focuses the bound control: a native input itself, or what a custom
 * control (`cv-password-input`) focuses in its `focus()`.
 */
export function focusFirstInvalid(form: FieldTree<unknown>): void {
  const first = form().errorSummary()[0]?.fieldTree as FieldTree<unknown> | undefined;
  first?.().focusBoundControl();
}
