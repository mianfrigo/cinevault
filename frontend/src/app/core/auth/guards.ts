import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth.store';

/** A post-login target is only valid as a same-origin path: one leading `/`, no `//`, no `/\`, no scheme. */
export function safeNext(value: string | null | undefined): string | null {
  return value && /^\/(?![/\\])/.test(value) ? value : null;
}

// The server renders every visitor-only decision as "let through": it has no session, so guarded
// areas render their shell there and the browser guard decides after the session restore.
const onServer = () => !isPlatformBrowser(inject(PLATFORM_ID));

const toLogin = (router: Router, next: string) =>
  router.createUrlTree(['/login'], { queryParams: { next } });

export const authGuard: CanActivateFn = async (_route, state) => {
  if (onServer()) return true;
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  return auth.isLoggedIn() || toLogin(router, state.url);
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  if (onServer()) return true;
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) return toLogin(router, state.url);
  return auth.isAdmin() || router.createUrlTree(['/dashboard/favorites']);
};

export const guestGuard: CanActivateFn = async (_route, state) => {
  if (onServer()) return true;
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.isLoggedIn()) return true;
  const next = safeNext(router.parseUrl(state.url).queryParams['next']);
  return router.parseUrl(next ?? '/dashboard/favorites');
};
