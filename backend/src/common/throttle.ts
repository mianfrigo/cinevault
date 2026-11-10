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
