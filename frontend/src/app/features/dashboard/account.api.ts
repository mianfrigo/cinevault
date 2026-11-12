import { Injectable, inject } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { ApiClient, toApiError } from '@core/api/api-client';
import { UserDto } from '@core/models';

/** The authenticated /me calls of the account page. Every method rejects with an `ApiError`. */
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly api = inject(ApiClient);

  updateName(name: string): Promise<UserDto> {
    return this.run(this.api.patch<UserDto>('/me', { name }));
  }
  /** The API revokes every session of the user; the caller must log out. */
  changePassword(oldPassword: string, newPassword: string): Promise<unknown> {
    return this.run(this.api.post('/me/change-password', { oldPassword, newPassword }));
  }
  changeEmail(newEmail: string, password: string): Promise<unknown> {
    return this.run(this.api.post('/me/change-email', { newEmail, password }));
  }
  deleteAccount(password: string): Promise<unknown> {
    return this.run(this.api.delete('/me', { password }));
  }

  private async run<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (e) {
      throw toApiError(e);
    }
  }
}
