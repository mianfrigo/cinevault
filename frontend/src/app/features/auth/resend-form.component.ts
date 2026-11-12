import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthFieldComponent } from './auth-field.component';
import { FocusOnDirective, focusFirstInvalid } from './auth-focus';
import { emailRules } from './auth.rules';

/** Asks for an address and requests a new verification link (used when the page does not know the email). */
@Component({
  selector: 'cv-resend-form',
  imports: [
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    MessageModule,
    AuthFieldComponent,
    FocusOnDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-4' },
  template: `
    @if (done()) {
      <p-message severity="success" role="status"
        >If that account needs verifying, we sent a new link.</p-message
      >
    } @else {
      @if (problem(); as p) {
        <p-message severity="error" role="alert" [cvFocusOn]="p">{{ p.text }}</p-message>
      }
      <form [formRoot]="resendForm" class="grid gap-4">
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

  protected readonly done = signal(false);
  protected readonly problem = signal<{ text: string } | null>(null);

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
          this.problem.set({ text: failureMessage(e as ApiError) });
        }
      },
    },
  });
}
