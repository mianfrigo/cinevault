import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

/** Equals the access-token lifetime: after that a blocked user's tokens are dead anyway. */
export const BLOCK_TTL_MS = 600_000;

const key = (userId: string) => `blocked:${userId}`;

/**
 * Lets a block take effect before the user's access token expires. The DB status
 * stays the source of truth (re-checked at login and refresh); this is only a
 * fast path. Cache failures never fail a request: on a read error the user is
 * treated as not blocked, so for at most the token lifetime a blocked user
 * could still use an already-issued access token while the cache is down.
 */
@Injectable()
export class BlockListService {
  private readonly logger = new Logger(BlockListService.name);
  private readWarned = false;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  private fail(level: 'warn' | 'error', op: string, e: unknown): void {
    this.logger[level](
      `block list ${op} failed: ${e instanceof Error ? e.name : 'Unknown error'}`,
    );
  }

  // A failed write is swallowed (the admin request must not fail) but logged at
  // error level. Accepted degradation: the DB status and revokeAll still stop
  // refresh; access tokens already issued stay valid for up to 10 minutes.
  async block(userId: string): Promise<void> {
    try {
      await this.cache.set(key(userId), '1', BLOCK_TTL_MS);
    } catch (e) {
      this.fail('error', 'write', e);
    }
  }

  async unblock(userId: string): Promise<void> {
    try {
      await this.cache.del(key(userId));
    } catch (e) {
      this.fail('error', 'delete', e);
    }
  }

  async isBlocked(userId: string): Promise<boolean> {
    try {
      return (await this.cache.get<string>(key(userId))) != null;
    } catch (e) {
      // Warn once per process: this runs on every guarded request.
      if (!this.readWarned) {
        this.readWarned = true;
        this.fail('warn', 'read', e);
      }
      return false;
    }
  }
}
