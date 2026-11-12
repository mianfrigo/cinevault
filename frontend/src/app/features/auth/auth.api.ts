import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient, toApiError } from '@core/api/api-client';

/** The unauthenticated /auth/* calls of the register, verify and reset flows. Rejects with an `ApiError`. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiClient);

  register(body: { name: string; email: string; password: string }) {
    return this.post('/auth/register', body);
  }
  verifyEmail(token: string) {
    return this.post('/auth/verify-email', { token });
  }
  resendVerification(email: string) {
    return this.post('/auth/resend-verification', { email });
  }
  forgotPassword(email: string) {
    return this.post('/auth/forgot-password', { email });
  }
  /** The token travels in the body only, never in the URL. */
  resetPassword(token: string, newPassword: string) {
    return this.post('/auth/reset-password', { token, newPassword });
  }

  private post(path: string, body: unknown): Promise<void> {
    return firstValueFrom(this.api.post<unknown>(path, body)).then(
      () => undefined,
      (e) => {
        throw toApiError(e);
      },
    );
  }
}
