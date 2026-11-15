import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createClient } from '@keyv/redis';

const open = () => createClient({ url: process.env.REDIS_URL });

/** Runs `fn` on a short-lived client of the test Redis (setup-env.ts guarantees it is not db 0). */
async function withTestRedis<T>(
  fn: (client: ReturnType<typeof open>) => Promise<T>,
): Promise<T> {
  const client = open();
  client.on('error', () => undefined);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export const flushTestRedis = () => withTestRedis((c) => c.flushDb());

/** Remaining TTL in ms of a key (-2 when the key does not exist). */
export const redisPttl = (key: string) => withTestRedis((c) => c.pTTL(key));

/** Empties the app's cache in every store, the per-process memory one too (flushTestRedis cannot reach it). */
export const clearAppCache = (app: {
  get: (token: typeof CACHE_MANAGER) => Cache;
}) => app.get(CACHE_MANAGER).clear();
