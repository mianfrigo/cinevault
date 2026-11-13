import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { apply, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ApiError } from '@core/models';
import { AuthApi } from './auth.api';
import { failureMessage } from '@shared/utils/failure-message';
import { AuthLayoutComponent } from './auth-layout.component';
import { AuthFieldComponent } from '@shared/components/auth-field/auth-field.component';
import { FormNoteComponent, Note } from '@shared/components/form-note/form-note.component';
import { focusFirstInvalid } from '@shared/utils/focus-first-invalid';
import {
  confirmMatches,
  emailRules,
  nameRules,
  newPasswordRules,
} from '@shared/validators/auth.rules';

@Component({
  selector: 'cv-register-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    AuthLayoutComponent,
    AuthFieldComponent,
    FormNoteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-layout
      heading="Create account"
      lead="One account keeps your favorites across phone and laptop. We will email a link to verify your address."
      art="register"
    >
      <cv-form-note [note]="problem()" />
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
          hint="At least 10 characters, at most 128."
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
          <a routerLink="/terms" class="link-underline">Terms</a>
          and
          <a routerLink="/privacy" class="link-underline">Privacy Policy</a>.
        </p>
      </form>
      <p class="mt-2 text-sm text-fg-2">
        Already have an account?
        <a routerLink="/login" class="link-underline">Log in</a>
      </p>
    </cv-auth-layout>
  `,
})
export default class RegisterPage {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  protected readonly problem = signal<Note | null>(null);

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
        onInvalid: focusFirstInvalid,
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
            this.problem.set({ kind: 'error', text: failureMessage(e as ApiError) });
          }
        },
      },
    },
  );
}
