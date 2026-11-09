import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

export const REFRESH_COOKIE = 'cv_refresh';
/** The cookie is only sent to the auth endpoints (refresh, logout). */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Clearing only works when everything but expiry matches how the cookie was set. */
const base = (env: Pick<Env, 'cookieSecure'>): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax',
  path: REFRESH_COOKIE_PATH,
});

/** Single place that defines the refresh cookie (login, refresh). */
export function setRefreshCookie(
  res: Response,
  raw: string,
  expiresAt: Date,
  env: Pick<Env, 'cookieSecure'>,
): void {
  res.cookie(REFRESH_COOKIE, raw, { ...base(env), expires: expiresAt });
}

export function clearRefreshCookie(
  res: Response,
  env: Pick<Env, 'cookieSecure'>,
): void {
  res.clearCookie(REFRESH_COOKIE, base(env));
}
