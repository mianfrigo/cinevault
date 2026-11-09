import { createClient } from '@keyv/redis';

/** Runs `fn` on a short-lived client of the test Redis (setup-env.ts guarantees it is not db 0). */
async function withTestRedis<T>(
  fn: (client: ReturnType<typeof createClient>) => Promise<T>,
): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
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
