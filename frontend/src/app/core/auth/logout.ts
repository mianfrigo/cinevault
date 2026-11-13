import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from './auth.store';

/**
 * The log out action of every log out button. It leaves first: a page that still holds work (a pending
 * favorite removal) sends it while the session is valid, then the session ends. A navigation that fails
 * (a lazy chunk that cannot load) must not keep the user logged in. Call it in an injection context.
 */
export function injectLogout(): () => Promise<void> {
  const auth = inject(AuthStore);
  const router = inject(Router);
  return async () => {
    await router.navigateByUrl('/').catch(() => undefined);
    await auth.logout();
  };
}
