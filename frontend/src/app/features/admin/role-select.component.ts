import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { SelectModule } from 'primeng/select';
import { Role } from '../../core/models';

const OPTIONS: { label: string; value: Role }[] = [
  { label: 'User', value: 'USER' },
  { label: 'Admin', value: 'ADMIN' },
];

/**
 * The role of one user. A Signal Forms field of its own (the row has no form), so the p-select binds with
 * `formField`. The choice is only a request: the parent sends it and passes the role the API confirms, and
 * when `busy` ends the select shows that role again, so a refused change never leaves the wrong one on screen.
 */
@Component({
  selector: 'cv-role-select',
  imports: [FormField, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-select
      [formField]="f.role"
      [options]="options"
      optionLabel="label"
      optionValue="value"
      size="small"
      appendTo="body"
      class="w-26 [--p-select-sm-font-size:0.875rem] max-md:w-34 [&_.p-select]:h-8 [&_.p-select]:max-md:h-11"
      [ariaLabel]="label()"
      (onChange)="roleChange.emit($event.value)"
    />
  `,
})
export class RoleSelectComponent {
  readonly role = input.required<Role>();
  /** Names the control for a screen reader: "Role for Ada Lovelace". */
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly roleChange = output<Role>();

  protected readonly options = OPTIONS;
  // While the request is in flight the choice stays; once it ends the select shows the row's real role again.
  private readonly model = linkedSignal<{ role: Role; busy: boolean }, { role: Role }>({
    source: () => ({ role: this.role(), busy: this.busy() }),
    computation: (src, previous) => (src.busy && previous ? previous.value : { role: src.role }),
  });
  protected readonly f = form(this.model, (p) => disabled(p.role, { when: () => this.disabled() }));
}
