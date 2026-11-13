import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ApiError } from '@core/models';
import { AuthApi } from './auth.api';
import { failureMessage } from '@shared/utils/failure-message';
import { AuthLayoutComponent } from './auth-layout.component';
import { FormNoteComponent, Note } from '@shared/components/form-note/form-note.component';
import { queryText } from '@shared/utils/query-text';
import { ResendFormComponent } from './resend-form.component';

type State = 'verifying' | 'verified' | 'expired' | 'invalid' | 'error';

const HEADINGS: Record<State, string> = {
  verifying: 'Verifying your email',
  verified: 'Email verified',
  expired: 'Link expired',
  invalid: 'Link not valid',
  error: 'We could not verify your email',
};

@Component({
  selector: 'cv-verify-email-page',
  imports: [
    RouterLink,
    ButtonModule,
    MessageModule,
    AuthLayoutComponent,
    ResendFormComponent,
    FormNoteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-layout [heading]="heading()" [lead]="lead()" art="verify">
      @switch (state()) {
        @case ('verifying') {
          <p role="status" class="text-fg-2">One moment.</p>
        }
        @case ('verified') {
          <cv-form-note [note]="verifiedNote" />
          <p-button label="Log in" [fluid]="true" routerLink="/login" />
        }
        @case ('error') {
          <cv-form-note [note]="failure()" />
          <p-button label="Retry" [fluid]="true" (onClick)="verify()" />
        }
        @default {
          <p-message severity="error" role="alert">{{
            state() === 'expired'
              ? 'This verification link has expired.'
              : 'This verification link is not valid.'
          }}</p-message>
          <cv-resend-form />
        }
      }
    </cv-auth-layout>
  `,
})
export default class VerifyEmailPage {
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  /** From the query string (router input binding). Only ever sent in the request body. */
  readonly token = input<string | string[]>();
  protected readonly state = signal<State>('verifying');
  protected readonly heading = computed(() => HEADINGS[this.state()]);
  protected readonly lead = computed(() =>
    this.state() === 'expired' || this.state() === 'invalid'
      ? 'Enter your email and we will send a new verification link.'
      : undefined,
  );
  protected readonly verifiedNote: Note = { kind: 'success', text: 'Your email is verified.' };
  protected readonly failure = signal<Note | null>(null);
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
        this.failure.set({ kind: 'error', text: failureMessage(error) });
        this.state.set('error');
      }
    }
  }
}
