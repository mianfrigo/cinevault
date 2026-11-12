import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ApiError } from '../../core/models';
import { AuthApi, failureMessage } from './auth.api';
import { queryText } from './auth.rules';
import { AuthCardComponent } from './auth-card.component';
import { ResendFormComponent } from './resend-form.component';

const COOLDOWN_SECONDS = 30;
const SHAPE = /^[^\s@]+@[^\s@]+$/;

@Component({
  selector: 'cv-check-email-page',
  imports: [RouterLink, ButtonModule, MessageModule, AuthCardComponent, ResendFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <cv-auth-card heading="Check your email">
      @if (address(); as to) {
        <p class="-mt-3 text-fg-2">
          We sent a verification link to<br />
          <span class="font-medium break-all text-fg">{{ to }}</span>
        </p>
        @if (notice(); as n) {
          <p-message [severity]="n.kind" role="status">{{ n.text }}</p-message>
        }
        <ol class="grid gap-3 text-sm text-fg-2">
          <li class="flex gap-3">
            <span class="w-4 text-fg-3">1</span>Open the email from Cinevault.
          </li>
          <li class="flex gap-3">
            <span class="w-4 text-fg-3">2</span>Select Verify email. The link works for 24 hours.
          </li>
          <li class="flex gap-3">
            <span class="w-4 text-fg-3">3</span>Come back and log in. Not there? Check spam or
            promotions.
          </li>
        </ol>
        <p-button
          [label]="remaining() ? 'Resend in ' + remaining() + 's' : 'Resend verification email'"
          [fluid]="true"
          [disabled]="remaining() > 0"
          [loading]="sending()"
          (onClick)="resend(to)"
        />
        <p-button
          label="Wrong address? Start over"
          variant="text"
          [fluid]="true"
          routerLink="/register"
        />
      } @else {
        <p class="-mt-3 text-fg-2">
          Open the verification link we emailed you. Need a new one? Enter your address.
        </p>
        <cv-resend-form />
      }
    </cv-auth-card>
  `,
})
export default class CheckEmailPage {
  private readonly authApi = inject(AuthApi);
  private readonly destroyRef = inject(DestroyRef);

  /** From the query string (router input binding); shown as text and only used when it looks like an address. */
  readonly email = input<string | string[]>();
  protected readonly address = computed(() => {
    const value = queryText(this.email())?.trim();
    return value && value.length <= 254 && SHAPE.test(value) ? value : null;
  });

  protected readonly remaining = signal(COOLDOWN_SECONDS);
  protected readonly sending = signal(false);
  protected readonly notice = signal<{ kind: 'success' | 'error'; text: string } | null>(null);
  private timer?: ReturnType<typeof setInterval>;
  private destroyed = false;

  constructor() {
    // Timers only exist in the browser; the server renders the 30 s state and the client resumes it.
    afterNextRender(() => this.startCountdown());
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearInterval(this.timer);
    });
  }

  protected async resend(to: string): Promise<void> {
    this.sending.set(true);
    try {
      await this.authApi.resendVerification(to);
      this.notice.set({ kind: 'success', text: 'Sent again. It can take a minute to arrive.' });
    } catch (e) {
      this.notice.set({ kind: 'error', text: failureMessage(e as ApiError) });
    } finally {
      this.sending.set(false);
      if (!this.destroyed) this.startCountdown(); // the page may have been left while the request ran
    }
  }

  private startCountdown(): void {
    clearInterval(this.timer);
    this.remaining.set(COOLDOWN_SECONDS);
    this.timer = setInterval(() => {
      this.remaining.update((n) => n - 1);
      if (this.remaining() <= 0) clearInterval(this.timer);
    }, 1000);
  }
}
