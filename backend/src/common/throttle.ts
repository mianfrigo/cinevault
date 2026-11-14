import { Throttle } from '@nestjs/throttler';

/**
 * Credential and email endpoints: 5 per minute per IP, counted per route. The API-wide
 * 100/min counter is shared by all routes (see app.module.ts), so it needs a different key.
 */
export const AuthThrottle = () =>
  Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
      generateKey: (ctx, tracker, name) =>
        `${ctx.getClass().name}-${ctx.getHandler().name}-${name}-${tracker}`,
    },
  });

/**
 * The routes that check the account's current password (change password, change email, delete
 * account): one shared 5 per minute per IP across all three. Left on the 100/min API-wide counter
 * they would be a faster password oracle than login; counted per route they would give three
 * budgets of guesses.
 */
export const PasswordCheckThrottle = () =>
  Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
      generateKey: (_ctx, tracker, name) => `password-check-${name}-${tracker}`,
    },
  });
