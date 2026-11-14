import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { apply, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthStore } from '@core/auth/auth.store';
import { safeNext } from '@core/auth/guards';
import { ApiError } from '@core/models';
import { AuthApi } from './auth.api';
import { failureMessage } from '@shared/utils/failure-message';
import { AuthLayoutComponent } from './auth-layout.component';
import { AuthFieldComponent } from '@shared/components/auth-field/auth-field.component';
import { FormNoteComponent, Note } from '@shared/components/form-note/form-note.component';
import { FocusOnDirective } from '@shared/directives/focus-on.directive';
import { focusFirstInvalid } from '@shared/utils/focus-first-invalid';
import { emailRules } from '@shared/validators/auth.rules';
import { queryText } from '@shared/utils/query-text';
import { PasswordInputComponent } from '@shared/components/password-input/password-input.component';
import { PreHydrationFormDirective } from '@shared/directives/pre-hydration-form.directive';

/** Fixed set of notices a redirect can ask the login page to show: nothing else is ever rendered. */
const NOTICES = new Map([
  ['password-reset', 'Your password was changed. Log in with your new password.'],
  ['password-changed', 'Password changed, please log in again.'],
]);

const LOGIN_MESSAGES = new Map([
  ['INVALID_CREDENTIALS', 'Email or password is incorrect.'],
  ['EMAIL_NOT_VERIFIED', 'Your email is not verified yet.'],
  ['ACCOUNT_BLOCKED', 'This account has been blocked.'],
]);

interface Banner {
  kind: 'error' | 'success';
  text: string;
  canResend?: boolean;
}

@Component({
  selector: 'cv-login-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    PreHydrationFormDirective,
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordInputComponent,
    AuthLayoutComponent,
    AuthFieldComponent,
    FormNoteComponent,
    FocusOnDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-layout
      heading="Log in"
      lead="Welcome back. Pick up your list where you left it."
      art="login"
    >
      <cv-form-note [note]="noticeNote()" />
      @if (banner(); as b) {
        <p-message [severity]="b.kind" role="alert" [cvFocusOn]="b">
          {{ b.text }}
          @if (b.canResend) {
            <p-button
              label="Resend verification email"
              variant="link"
              size="small"
              [loading]="resending()"
              (onClick)="resend()"
            />
          }
        </p-message>
      }
      <form cvPreHydration [formRoot]="loginForm" class="grid gap-4">
        <cv-auth-field label="Email" controlId="email" [field]="loginForm.email">
          <input
            pInputText
            id="email"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            class="w-full"
            [formField]="loginForm.email"
          />
        </cv-auth-field>
        <cv-auth-field label="Password" controlId="password" [field]="loginForm.password">
          <a
            slot="label-end"
            routerLink="/forgot-password"
            class="-my-3 py-3 text-sm link-underline"
            >Forgot password?</a
          >
          <cv-password-input
            inputId="password"
            autocomplete="current-password"
            [formField]="loginForm.password"
          />
        </cv-auth-field>
        <p-button
          type="submit"
          label="Log in"
          [fluid]="true"
          [loading]="loginForm().submitting()"
        />
      </form>
      <p class="mt-2 text-sm text-fg-2">
        New to Cinevault?
        <a routerLink="/register" class="link-underline">Create an account</a>
      </p>
    </cv-auth-layout>
  `,
})
export default class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  /** Query params, bound by the router. `next` is only honoured as a same-origin path. */
  readonly next = input<string | string[]>();
  readonly notice = input<string | string[]>();

  protected readonly noticeNote = computed<Note | null>(() => {
    const text = NOTICES.get(queryText(this.notice()) ?? '');
    return text ? { kind: 'success', text } : null;
  });
  protected readonly banner = signal<Banner | null>(null);
  protected readonly resending = signal(false);
  /** The address that failed to log in: the banner's Resend uses it, not whatever the field holds now. */
  private failedEmail = '';

  private readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(
    this.model,
    (path) => {
      apply(path.email, emailRules);
      required(path.password, { message: 'Enter your password.' });
    },
    {
      submission: {
        onInvalid: focusFirstInvalid,
        action: async (f) => {
          this.banner.set(null);
          const email = f.email().value().trim();
          try {
            await this.auth.login(email, f.password().value());
          } catch (e) {
            const error = e as ApiError; // AuthStore.login rejects with the API error body
            this.failedEmail = email;
            this.banner.set({
              kind: 'error',
              text: LOGIN_MESSAGES.get(error.code) ?? failureMessage(error),
              canResend: error.code === 'EMAIL_NOT_VERIFIED',
            });
            return;
          }
          await this.router.navigateByUrl(safeNext(this.next()) ?? '/dashboard/favorites');
        },
      },
    },
  );

  protected async resend(): Promise<void> {
    this.resending.set(true);
    try {
      await this.authApi.resendVerification(this.failedEmail);
      this.banner.set({
        kind: 'success',
        text: 'Verification email sent. It can take a minute to arrive.',
      });
    } catch (e) {
      this.banner.set({ kind: 'error', text: failureMessage(e as ApiError) });
    } finally {
      this.resending.set(false);
    }
  }
}
