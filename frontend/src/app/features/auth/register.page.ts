import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { AuthFieldComponent } from './auth-field.component';
import { confirmMatches, emailRules, nameRules, newPasswordRules } from './auth.rules';

@Component({
  selector: 'cv-register-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    AuthCardComponent,
    AuthFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-card
      heading="Create account"
      lead="One account keeps your favorites across phone and laptop. We will email a link to verify your address."
    >
      @if (problem(); as text) {
        <p-message severity="error" role="alert">{{ text }}</p-message>
      }
      <form [formRoot]="registerForm" class="grid gap-4">
        <cv-auth-field label="Name" controlId="name" [field]="registerForm.name">
          <input
            pInputText
            id="name"
            autocomplete="name"
            placeholder="Alex Mercer"
            class="w-full"
            [formField]="registerForm.name"
          />
        </cv-auth-field>
        <cv-auth-field label="Email" controlId="email" [field]="registerForm.email">
          <input
            pInputText
            id="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
            [formField]="registerForm.email"
          />
        </cv-auth-field>
        <cv-auth-field
          label="Password"
          controlId="password"
          hint="At least 10 characters."
          [field]="registerForm.password"
        >
          <p-password
            inputId="password"
            autocomplete="new-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="registerForm.password"
          />
        </cv-auth-field>
        <cv-auth-field label="Confirm password" controlId="confirm" [field]="registerForm.confirm">
          <p-password
            inputId="confirm"
            autocomplete="new-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
            [formField]="registerForm.confirm"
          />
        </cv-auth-field>
        <p-button
          type="submit"
          label="Create account"
          [fluid]="true"
          [loading]="registerForm().submitting()"
        />
        <p class="text-label text-fg-3">
          By creating an account you agree to the
          <a routerLink="/terms" class="text-fg underline underline-offset-4">Terms</a> and
          <a routerLink="/privacy" class="text-fg underline underline-offset-4">Privacy Policy</a>.
        </p>
      </form>
      <p class="text-sm text-fg-2">
        Already have an account?
        <a
          routerLink="/login"
          class="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >Log in</a
        >
      </p>
    </cv-auth-card>
  `,
})
export default class RegisterPage {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  protected readonly problem = signal<string | null>(null);

  private readonly model = signal({ name: '', email: '', password: '', confirm: '' });
  protected readonly registerForm = form(
    this.model,
    (path) => {
      apply(path.name, nameRules);
      apply(path.email, emailRules);
      apply(path.password, newPasswordRules);
      required(path.confirm, { message: 'Confirm your password.' });
      confirmMatches(path.confirm, path.password);
    },
    {
      submission: {
        action: async (f) => {
          this.problem.set(null);
          try {
            const email = f.email().value().trim();
            await this.authApi.register({
              name: f.name().value().trim(),
              email,
              password: f.password().value(),
            });
            // 202 whatever the address (no enumeration); only the email goes in the URL.
            await this.router.navigate(['/check-email'], { queryParams: { email } });
          } catch (e) {
            this.problem.set(failureMessage(e as ApiError));
          }
        },
      },
    },
  );
}
