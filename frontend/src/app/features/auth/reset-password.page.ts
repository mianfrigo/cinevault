import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { form, FormField, FormRoot, required, apply } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { AuthFieldComponent } from './auth-field.component';
import { FocusOnDirective, focusFirstInvalid } from './auth-focus';
import { confirmMatches, newPasswordRules, queryText } from './auth.rules';

type View = 'form' | 'expired' | 'invalid';

@Component({
  selector: 'cv-reset-password-page',
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    ButtonModule,
    MessageModule,
    PasswordModule,
    AuthCardComponent,
    AuthFieldComponent,
    FocusOnDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (view()) {
      @case ('form') {
        <cv-auth-card
          heading="Choose a new password"
          lead="Pick a password you have not used here before."
        >
          @if (problem(); as p) {
            <p-message severity="error" role="alert" [cvFocusOn]="p">{{ p.text }}</p-message>
          }
          <form [formRoot]="resetForm" class="grid gap-4">
            <cv-auth-field
              label="New password"
              controlId="password"
              hint="At least 10 characters."
              [field]="resetForm.password"
            >
              <p-password
                inputId="password"
                autocomplete="new-password"
                [feedback]="false"
                [toggleMask]="true"
                [fluid]="true"
                [formField]="resetForm.password"
              />
            </cv-auth-field>
            <cv-auth-field label="Confirm password" controlId="confirm" [field]="resetForm.confirm">
              <p-password
                inputId="confirm"
                autocomplete="new-password"
                [feedback]="false"
                [toggleMask]="true"
                [fluid]="true"
                [formField]="resetForm.confirm"
              />
            </cv-auth-field>
            <p-button
              type="submit"
              label="Change password"
              [fluid]="true"
              [loading]="resetForm().submitting()"
            />
          </form>
        </cv-auth-card>
      }
      @case ('expired') {
        <cv-auth-card heading="Link expired">
          <p-message severity="error" role="alert">This reset link has expired.</p-message>
          <p-button label="Request a new link" [fluid]="true" routerLink="/forgot-password" />
        </cv-auth-card>
      }
      @default {
        <cv-auth-card heading="Link not valid">
          <p-message severity="error" role="alert">This reset link is not valid.</p-message>
          <p-button label="Request a new link" [fluid]="true" routerLink="/forgot-password" />
        </cv-auth-card>
      }
    }
  `,
})
export default class ResetPasswordPage {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  /** From the query string (router input binding). Only ever sent in the request body. */
  readonly token = input<string | string[]>();
  /** Held in memory once it has left the address bar (the input goes empty after that). */
  private readonly kept = signal<string | undefined>(undefined);
  private readonly activeToken = computed(() => this.kept() ?? queryText(this.token()));

  private readonly outcome = signal<View>('form');
  protected readonly view = computed<View>(() => (this.activeToken() ? this.outcome() : 'invalid'));
  protected readonly problem = signal<{ text: string } | null>(null);

  constructor() {
    // Browser only: take the token out of the address bar and history once it has been read.
    afterNextRender(() => {
      const token = queryText(this.token());
      if (!token) return;
      this.kept.set(token);
      void this.router.navigate([], {
        replaceUrl: true,
        queryParams: { token: null },
        queryParamsHandling: 'merge',
      });
    });
  }

  private readonly model = signal({ password: '', confirm: '' });
  protected readonly resetForm = form(
    this.model,
    (path) => {
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
            await this.authApi.resetPassword(this.activeToken()!, f.password().value());
          } catch (e) {
            const error = e as ApiError;
            if (error.code === 'TOKEN_EXPIRED') this.outcome.set('expired');
            else if (error.code === 'TOKEN_INVALID') this.outcome.set('invalid');
            else this.problem.set({ text: failureMessage(error) });
            return;
          }
          await this.router.navigate(['/login'], { queryParams: { notice: 'password-reset' } });
        },
      },
    },
  );
}
