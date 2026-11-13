import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ApiError } from '@core/models';
import { AuthApi } from './auth.api';
import { failureMessage } from '@shared/utils/failure-message';
import { AuthLayoutComponent } from './auth-layout.component';
import { AuthFieldComponent } from '@shared/components/auth-field/auth-field.component';
import { FormNoteComponent, Note } from '@shared/components/form-note/form-note.component';
import { focusFirstInvalid } from '@shared/utils/focus-first-invalid';
import { emailRules } from '@shared/validators/auth.rules';

@Component({
  selector: 'cv-forgot-password-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    AuthLayoutComponent,
    AuthFieldComponent,
    FormNoteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-layout
      [heading]="sent() ? 'Check your inbox' : 'Reset password'"
      [lead]="
        sent()
          ? undefined
          : 'Enter the email you signed up with. We will send a link to choose a new password.'
      "
      art="recover"
      back="login"
      [mail]="sent()"
    >
      @if (sent()) {
        <p role="status" slot="lead" class="mt-3 max-w-[44ch] text-fg-2">
          If that email exists, we sent a link.
        </p>
      }
      @if (sent()) {
        <div class="grid gap-2">
          <p-button
            label="Back to log in"
            severity="secondary"
            [fluid]="true"
            routerLink="/login"
          />
          <p-button
            label="Use a different email"
            severity="secondary"
            variant="text"
            [fluid]="true"
            (onClick)="sent.set(false)"
          />
        </div>
      } @else {
        <cv-form-note [note]="problem()" />
        <form [formRoot]="forgotForm" class="grid gap-4">
          <cv-auth-field label="Email" controlId="email" [field]="forgotForm.email">
            <input
              pInputText
              id="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full"
              [formField]="forgotForm.email"
            />
          </cv-auth-field>
          <p-button
            type="submit"
            label="Send reset link"
            [fluid]="true"
            [loading]="forgotForm().submitting()"
          />
        </form>
        <p class="mt-2 text-sm text-fg-2">
          Remembered it?
          <a routerLink="/login" class="link-underline">Log in</a>
        </p>
      }
    </cv-auth-layout>
  `,
})
export default class ForgotPasswordPage {
  private readonly authApi = inject(AuthApi);

  protected readonly sent = signal(false);
  protected readonly problem = signal<Note | null>(null);

  private readonly model = signal({ email: '' });
  protected readonly forgotForm = form(this.model, (path) => apply(path.email, emailRules), {
    submission: {
      onInvalid: focusFirstInvalid,
      action: async (f) => {
        this.problem.set(null);
        try {
          await this.authApi.forgotPassword(f.email().value().trim());
          this.sent.set(true); // same copy whether or not the address exists (always 202)
        } catch (e) {
          this.problem.set({ kind: 'error', text: failureMessage(e as ApiError) });
        }
      },
    },
  });
}
