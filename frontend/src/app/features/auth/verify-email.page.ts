import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { FocusOnDirective } from './auth-focus';
import { queryText } from './auth.rules';
import { ResendFormComponent } from './resend-form.component';

type State = 'verifying' | 'verified' | 'expired' | 'invalid' | 'error';

@Component({
  selector: 'cv-verify-email-page',
  imports: [
    RouterLink,
    ButtonModule,
    MessageModule,
    AuthCardComponent,
    ResendFormComponent,
    FocusOnDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('verifying') {
        <cv-auth-card heading="Verifying your email">
          <p role="status" class="text-fg-2">One moment.</p>
        </cv-auth-card>
      }
      @case ('verified') {
        <cv-auth-card heading="Email verified">
          <p-message severity="success" role="status">Your email is verified.</p-message>
          <p-button label="Log in" [fluid]="true" routerLink="/login" />
        </cv-auth-card>
      }
      @case ('error') {
        <cv-auth-card heading="We could not verify your email">
          @if (failure(); as f) {
            <p-message severity="error" role="alert" [cvFocusOn]="f">{{ f.text }}</p-message>
          }
          <p-button label="Retry" [fluid]="true" (onClick)="verify()" />
        </cv-auth-card>
      }
      @default {
        <cv-auth-card
          [heading]="state() === 'expired' ? 'Link expired' : 'Link not valid'"
          lead="Enter your email and we will send a new verification link."
        >
          <p-message severity="error" role="alert">{{
            state() === 'expired'
              ? 'This verification link has expired.'
              : 'This verification link is not valid.'
          }}</p-message>
          <cv-resend-form />
        </cv-auth-card>
      }
    }
  `,
})
export default class VerifyEmailPage {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  /** From the query string (router input binding). Only ever sent in the request body. */
  readonly token = input<string | string[]>();
  protected readonly state = signal<State>('verifying');
  protected readonly failure = signal<{ text: string } | null>(null);
  /** Kept in memory once it has left the address bar, for Retry. */
  private spent?: string;

  constructor() {
    // afterNextRender runs in the browser only and once per component instance, so the automatic
    // call happens exactly once per page load (never during SSR, never on a re-render).
    afterNextRender(() => {
      this.spent = queryText(this.token());
      if (!this.spent) return this.state.set('invalid');
      // Drop the token from the address bar and history; the input then goes empty, which is fine
      // because nothing reads it again.
      void this.router.navigate([], {
        replaceUrl: true,
        queryParams: { token: null },
        queryParamsHandling: 'merge',
      });
      return this.verify();
    });
  }

  protected async verify(): Promise<void> {
    this.state.set('verifying');
    try {
      await this.authApi.verifyEmail(this.spent!);
      this.state.set('verified');
    } catch (e) {
      const error = e as ApiError;
      if (error.code === 'TOKEN_EXPIRED') this.state.set('expired');
      else if (error.code === 'TOKEN_INVALID') this.state.set('invalid');
      else {
        this.failure.set({ text: failureMessage(error) });
        this.state.set('error');
      }
    }
  }
}
