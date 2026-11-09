import { CacheModule } from '@nestjs/cache-manager';
import { Logger, Module } from '@nestjs/common';
import { createKeyv } from '@keyv/redis';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';
import { ENV, type Env } from '../config/env';

/** Max wait for a Redis connection attempt, so a dead Redis never stalls a request. */
const REDIS_CONNECT_MS = 500;

/** Global cache: Redis first, per-process memory as the fallback (TTLs are in ms). */
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ENV],
      useFactory: (env: Env) => {
        const log = new Logger('Cache');
        // No automatic reconnect and no offline queue: each operation tries to
        // (re)connect once, fails fast and falls through to the memory store.
        const redis = createKeyv(
          {
            url: env.redisUrl,
            disableOfflineQueue: true,
            socket: {
              reconnectStrategy: false,
              connectTimeout: REDIS_CONNECT_MS,
            },
          },
          { throwOnConnectError: false, connectionTimeout: REDIS_CONNECT_MS },
        );
        let warned = false;
        // Required: an unhandled 'error' event would crash the process.
        redis.on('error', (err: Error & { code?: string }) => {
          if (warned) return;
          warned = true;
          // Code only: messages can embed the Redis URL, which may hold credentials.
          log.warn(
            `Redis unavailable (${err.code ?? err.name}); using in-memory cache fallback`,
          );
        });
        return {
          stores: [
            redis,
            new Keyv({ store: new KeyvCacheableMemory({ lruSize: 5000 }) }),
          ],
        };
      },
    }),
  ],
})
export class AppCacheModule {}
