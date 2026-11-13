import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import {
  disabled,
  form,
  FormField,
  FormValueControl,
  metadata,
  readonly,
  REQUIRED,
} from '@angular/forms/signals';
import { SelectModule } from 'primeng/select';
import { Role } from '@core/models';

const OPTIONS: { label: string; value: Role }[] = [
  { label: 'User', value: 'USER' },
  { label: 'Admin', value: 'ADMIN' },
];

/**
 * The role of one user, a Signal Forms control (`[formField]`, or `[(value)]` on its own) over PrimeNG
 * `p-select`. PrimeNG only takes its value through a value accessor, so the control keeps a field of its
 * own over `value` and mirrors `disabled` onto it. The pick is only a request: whoever owns the value
 * (the users page) sends it and writes the confirmed role back, which is how a refused change reverts.
 */
@Component({
  selector: 'cv-role-select',
  imports: [FormField, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-select
      [name]="name() || undefined"
      [formField]="inner"
      [options]="options"
      optionLabel="label"
      optionValue="value"
      size="small"
      appendTo="body"
      class="w-26 [--p-select-sm-font-size:0.875rem] max-md:w-34 [&_.p-select]:h-8 [&_.p-select]:max-md:h-11"
      [ariaLabel]="label()"
      (onBlur)="touch.emit()"
    />
  `,
})
export class RoleSelectComponent implements FormValueControl<Role> {
  readonly value = model.required<Role>();
  /** Names the control for a screen reader: "Role for Ada Lovelace". */
  readonly label = input.required<string>();
  readonly disabled = input(false);
  /** Field state the select shows (`required`, `readonly`, `name`), as when the field was bound to p-select itself. */
  readonly required = input(false);
  readonly readonly = input(false);
  readonly name = input('');
  /** Blur of the select: marks the bound field as touched. */
  readonly touch = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly options = OPTIONS;
  protected readonly inner = form(this.value, (p) => {
    disabled(p, { when: () => this.disabled() });
    readonly(p, () => this.readonly());
    metadata(p, REQUIRED, () => this.required());
  });

  /** Focuses the select's combobox (the host and the p-select wrapper are not focusable). */
  focus(options?: FocusOptions): void {
    this.host.nativeElement.querySelector<HTMLElement>('[role=combobox]')?.focus(options);
  }
}
