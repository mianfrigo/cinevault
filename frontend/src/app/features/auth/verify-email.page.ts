import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthApi } from './auth.api';
import { AuthCardComponent } from './auth-card.component';
import { ResendFormComponent } from './resend-form.component';

type State = 'verifying' | 'verified' | 'expired' | 'invalid';

@Component({
  selector: 'cv-verify-email-page',
  imports: [RouterLink, ButtonModule, MessageModule, AuthCardComponent, ResendFormComponent],
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

  /** From the query string (router input binding). Only ever sent in the request body. */
  readonly token = input<string>();
  protected readonly state = signal<State>('verifying');

  constructor() {
    // afterNextRender runs in the browser only and once per component instance, so the token is
    // spent exactly once per page load (never during SSR, never on a re-render).
    afterNextRender(async () => {
      const token = this.token();
      if (!token) return this.state.set('invalid');
      try {
        await this.authApi.verifyEmail(token);
        this.state.set('verified');
      } catch (e) {
        this.state.set((e as { code?: string }).code === 'TOKEN_EXPIRED' ? 'expired' : 'invalid');
      }
    });
  }
}
