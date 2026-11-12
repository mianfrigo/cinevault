import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { AuthFieldComponent } from './auth-field.component';
import { emailRules } from './auth.rules';

@Component({
  selector: 'cv-forgot-password-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    MessageModule,
    AuthCardComponent,
    AuthFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sent()) {
      <cv-auth-card heading="Check your inbox">
        <p role="status" class="text-fg-2">If that email exists, we sent a link.</p>
        <p-button label="Back to log in" severity="secondary" [fluid]="true" routerLink="/login" />
        <p-button
          label="Use a different email"
          variant="text"
          [fluid]="true"
          (onClick)="sent.set(false)"
        />
      </cv-auth-card>
    } @else {
      <cv-auth-card
        heading="Reset password"
        lead="Enter the email you signed up with. We will send a link to choose a new password."
      >
        @if (problem(); as text) {
          <p-message severity="error" role="alert">{{ text }}</p-message>
        }
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
        <p class="text-sm text-fg-2">
          Remembered it?
          <a
            routerLink="/login"
            class="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current"
            >Log in</a
          >
        </p>
      </cv-auth-card>
    }
  `,
})
export default class ForgotPasswordPage {
  private readonly authApi = inject(AuthApi);

  protected readonly sent = signal(false);
  protected readonly problem = signal<string | null>(null);

  private readonly model = signal({ email: '' });
  protected readonly forgotForm = form(this.model, (path) => apply(path.email, emailRules), {
    submission: {
      action: async (f) => {
        this.problem.set(null);
        try {
          await this.authApi.forgotPassword(f.email().value().trim());
          this.sent.set(true); // same copy whether or not the address exists (always 202)
        } catch (e) {
          this.problem.set(failureMessage(e as ApiError));
        }
      },
    },
  });
}
