import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { apply, form, FormField, FormRoot, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthStore } from '../../core/auth/auth.store';
import { safeNext } from '../../core/auth/guards';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { AuthFieldComponent } from './auth-field.component';
import { emailRules } from './auth.rules';

/** Fixed set of notices a redirect can ask the login page to show: nothing else is ever rendered. */
const NOTICES = new Map([
  ['password-reset', 'Your password was changed. Log in with your new password.'],
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
    ButtonModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    AuthCardComponent,
    AuthFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-card heading="Log in" lead="Welcome back. Pick up your list where you left it.">
      @if (noticeText(); as text) {
        <p-message severity="success">{{ text }}</p-message>
      }
      @if (banner(); as b) {
        <p-message [severity]="b.kind" role="alert">
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
      <form [formRoot]="loginForm" class="grid gap-4">
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
            class="text-sm text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current"
            >Forgot password?</a
          >
          <p-password
            inputId="password"
            autocomplete="current-password"
            [feedback]="false"
            [toggleMask]="true"
            [fluid]="true"
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
      <p class="text-sm text-fg-2">
        New to Cinevault?
        <a
          routerLink="/register"
          class="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-current"
          >Create an account</a
        >
      </p>
    </cv-auth-card>
  `,
})
export default class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  /** Query params, bound by the router. `next` is only honoured as a same-origin path. */
  readonly next = input<string>();
  readonly notice = input<string>();

  protected readonly noticeText = computed(() => NOTICES.get(this.notice() ?? ''));
  protected readonly banner = signal<Banner | null>(null);
  protected readonly resending = signal(false);

  private readonly model = signal({ email: '', password: '' });
  protected readonly loginForm = form(
    this.model,
    (path) => {
      apply(path.email, emailRules);
      required(path.password, { message: 'Enter your password.' });
    },
    {
      submission: {
        action: async (f) => {
          this.banner.set(null);
          try {
            await this.auth.login(f.email().value().trim(), f.password().value());
          } catch (e) {
            const error = e as ApiError; // AuthStore.login rejects with the API error body
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
      await this.authApi.resendVerification(this.model().email.trim());
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
