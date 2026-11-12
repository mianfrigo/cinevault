import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { MessageModule } from 'primeng/message';

/**
 * Label, control and inline error of one form field. The control is projected and keeps its own
 * `[formField]` binding; this only reads the field's state. The error is text (first message),
 * shown once the field was touched, and announced as an alert by `p-message`.
 */
@Component({
  selector: 'cv-auth-field',
  imports: [MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-baseline justify-between gap-3">
      <label [for]="controlId()" class="text-sm font-medium text-fg">{{ label() }}</label>
      <ng-content select="[slot=label-end]" />
    </div>
    <ng-content />
    @if (hint() && !showError()) {
      <p [attr.id]="controlId() + '-hint'" class="text-label text-fg-3">{{ hint() }}</p>
    }
    @if (showError()) {
      <p-message
        [attr.id]="controlId() + '-error'"
        severity="error"
        size="small"
        variant="simple"
        >{{ field()().errors()[0]?.message }}</p-message
      >
    }
  `,
  // Signal Forms hands PrimeNG controls the raw `invalid` state, so an untouched empty field would
  // render red. Until the error is shown the invalid tokens fall back to the neutral ones.
  host: {
    class:
      'grid gap-2 not-data-invalid:[--p-inputtext-invalid-border-color:var(--p-inputtext-border-color)] not-data-invalid:[--p-inputtext-invalid-placeholder-color:var(--p-inputtext-placeholder-color)]',
    '[attr.data-invalid]': 'showError() ? "" : null',
  },
})
export class AuthFieldComponent {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly field = input.required<FieldTree<string>>();
  readonly hint = input<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Neither Signal Forms nor p-password link the control to its hint or error, so do it here
    // (`[id]` matches the p-password inner input too). Browser only; the server HTML lacks the links.
    afterRenderEffect(() => {
      const control = this.host.nativeElement.querySelector(`[id="${this.controlId()}"]`);
      const id = this.showError()
        ? this.controlId() + '-error'
        : this.hint()
          ? this.controlId() + '-hint'
          : null;
      if (id) control?.setAttribute('aria-describedby', id);
      else control?.removeAttribute('aria-describedby');
      if (this.showError()) control?.setAttribute('aria-invalid', 'true');
      else control?.removeAttribute('aria-invalid');
    });
  }

  protected readonly showError = computed(() => {
    const state = this.field()();
    return state.touched() && state.invalid();
  });
}
