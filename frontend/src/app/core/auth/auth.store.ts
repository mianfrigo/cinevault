import { computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiClient, toApiError } from '../api/api-client';
import { AuthResult, UserDto } from '../models';

interface AuthState {
  user: UserDto | null;
  /** Memory only: never written to localStorage, sessionStorage or a cookie. */
  accessToken: string | null;
  /** True once the first session restore finished (or timed out), so guards know whether "no user" is final. */
  ready: boolean;
}

const READY_TIMEOUT_MS = 3000;
const REFRESH_LOCK = 'cv-refresh';

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({ user: null, accessToken: null, ready: false }),
  withComputed(({ user }) => ({
    isLoggedIn: computed(() => user() !== null),
    isAdmin: computed(() => user()?.role === 'ADMIN'),
  })),
  withMethods((store) => {
    const api = inject(ApiClient);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));

    let inFlight: Promise<boolean> | null = null;
    let restoring = false;
    let markReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => (markReady = resolve));

    const setReady = () => {
      patchState(store, { ready: true });
      markReady();
    };
    const setSession = ({ accessToken, user }: AuthResult) => {
      patchState(store, { accessToken, user });
      setReady();
    };
    const clearSession = () => patchState(store, { user: null, accessToken: null });

    const callRefresh = async (): Promise<boolean> => {
      try {
        setSession(await firstValueFrom(api.post<AuthResult>('/auth/refresh')));
        return true;
      } catch {
        clearSession();
        return false;
      }
    };

    /**
     * One refresh at a time. Concurrent callers in this tab share one promise. Across tabs the
     * request runs under the Web Lock `cv-refresh`: a refresh token that is used twice counts as
     * reuse and revokes every session of the user, so two tabs must never send the same cookie at
     * once. The refresh cookie is shared by all tabs, so a tab that gets the lock second simply
     * sends the cookie the first tab just rotated, which is valid. A failure after the lock is
     * therefore a real rejection and ends the session. Without `navigator.locks` (old browsers,
     * server) only the in-tab promise applies.
     */
    const refresh = (): Promise<boolean> => {
      if (!browser) return Promise.resolve(false);
      inFlight ??= (navigator.locks?.request(REFRESH_LOCK, callRefresh) ?? callRefresh()).finally(
        () => (inFlight = null),
      );
      return inFlight;
    };

    return {
      clearSession,
      setUser: (user: UserDto) => patchState(store, { user }),

      /** Resolves once the session restore has finished; guards await it before deciding. */
      whenReady: () => readyPromise,

      async login(email: string, password: string): Promise<void> {
        try {
          setSession(
            await firstValueFrom(api.post<AuthResult>('/auth/login', { email, password })),
          );
        } catch (e) {
          throw toApiError(e);
        }
      },

      async logout(): Promise<void> {
        try {
          await firstValueFrom(api.post<void>('/auth/logout'));
        } catch {
          // The local session ends either way; the cookie expires on its own at worst.
        } finally {
          clearSession();
        }
      },

      refresh,

      /** Browser only, once (app initializer). Never throws; `ready` is set when done or after 3 s. */
      async restoreSession(): Promise<void> {
        if (!browser || restoring) return;
        restoring = true;
        const timer = setTimeout(setReady, READY_TIMEOUT_MS);
        try {
          await refresh();
        } finally {
          clearTimeout(timer);
          setReady();
        }
      },
    };
  }),
);
