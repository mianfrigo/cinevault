import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { disabled, form, FormField, FormValueControl, validate } from '@angular/forms/signals';
import { PasswordModule } from 'primeng/password';

/**
 * A password field: PrimeNG `p-password` (no strength meter, with the show/hide toggle, full width)
 * as a Signal Forms control. Bind it like an input: `<cv-password-input inputId="x" [formField]="f.x" />`.
 *
 * PrimeNG only takes its value through a value accessor, so the control keeps a field of its own over
 * `value` (the pattern `cv-role-select` uses) and mirrors `disabled` and `invalid` onto it. `invalid` is
 * the raw state, as PrimeNG always got it: `cv-auth-field` decides when the error is shown and keeps an
 * untouched field from looking red.
 */
@Component({
  selector: 'cv-password-input',
  imports: [FormField, PasswordModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // No box of its own: the p-password is laid out as if it were the direct child of the form field.
  host: { class: 'contents' },
  template: `
    <p-password
      [inputId]="inputId()"
      [autocomplete]="autocomplete()"
      [feedback]="false"
      [toggleMask]="true"
      [fluid]="true"
      [formField]="inner"
      (onBlur)="touch.emit()"
    />
  `,
})
export class PasswordInputComponent implements FormValueControl<string> {
  readonly value = model('');
  /** Id of the native input, so a `<label for>` and `cv-auth-field` find it. */
  readonly inputId = input.required<string>();
  readonly autocomplete = input<string>();
  readonly disabled = input(false);
  readonly invalid = input(false);
  /** Blur of the input: marks the bound field as touched. */
  readonly touch = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly inner = form(this.value, (p) => {
    disabled(p, { when: () => this.disabled() });
    validate(p, () => (this.invalid() ? { kind: 'invalid' } : undefined));
  });

  /** Focuses the native input (the host and the p-password wrapper are not focusable). */
  focus(options?: FocusOptions): void {
    this.host.nativeElement.querySelector('input')?.focus(options);
  }
}
