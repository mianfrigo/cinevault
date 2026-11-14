import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ApiError } from '@core/models';
import { AuthApi } from './auth.api';
import { failureMessage } from '@shared/utils/failure-message';
import { AuthFieldComponent } from '@shared/components/auth-field/auth-field.component';
import { FormNoteComponent, Note } from '@shared/components/form-note/form-note.component';
import { focusFirstInvalid } from '@shared/utils/focus-first-invalid';
import { emailRules } from '@shared/validators/auth.rules';
import { PreHydrationFormDirective } from '@shared/directives/pre-hydration-form.directive';

/** Asks for an address and requests a new verification link (used when the page does not know the email). */
@Component({
  selector: 'cv-resend-form',
  imports: [
    FormField,
    FormRoot,
    PreHydrationFormDirective,
    ButtonModule,
    InputTextModule,
    AuthFieldComponent,
    FormNoteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    @if (done()) {
      <cv-form-note [note]="sentNote" />
    } @else {
      <cv-form-note [note]="problem()" />
      <form cvPreHydration [formRoot]="resendForm" class="grid gap-4">
        <cv-auth-field label="Email" controlId="email" [field]="resendForm.email">
          <input
            pInputText
            id="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
            [formField]="resendForm.email"
          />
        </cv-auth-field>
        <p-button
          type="submit"
          label="Resend verification email"
          [fluid]="true"
          [loading]="resendForm().submitting()"
        />
      </form>
    }
  `,
})
export class ResendFormComponent {
  private readonly authApi = inject(AuthApi);

  protected readonly sentNote: Note = {
    kind: 'success',
    text: 'If that account needs verifying, we sent a new link.',
  };
  protected readonly done = signal(false);
  protected readonly problem = signal<Note | null>(null);

  private readonly model = signal({ email: '' });
  protected readonly resendForm = form(this.model, (path) => apply(path.email, emailRules), {
    submission: {
      onInvalid: focusFirstInvalid,
      action: async (f) => {
        this.problem.set(null);
        try {
          await this.authApi.resendVerification(f.email().value().trim());
          this.done.set(true);
        } catch (e) {
          this.problem.set({ kind: 'error', text: failureMessage(e as ApiError) });
        }
      },
    },
  });
}
