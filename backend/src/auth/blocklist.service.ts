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

  private warn(op: string, e: unknown): void {
    this.logger.warn(
      `block list ${op} failed: ${e instanceof Error ? e.name : 'Unknown error'}`,
    );
  }

  async block(userId: string): Promise<void> {
    try {
      await this.cache.set(key(userId), '1', BLOCK_TTL_MS);
    } catch (e) {
      this.warn('write', e);
    }
  }

  async unblock(userId: string): Promise<void> {
    try {
      await this.cache.del(key(userId));
    } catch (e) {
      this.warn('delete', e);
    }
  }

  async isBlocked(userId: string): Promise<boolean> {
    try {
      return (await this.cache.get<string>(key(userId))) != null;
    } catch (e) {
      // Warn once per process: this runs on every guarded request.
      if (!this.readWarned) {
        this.readWarned = true;
        this.warn('read', e);
      }
      return false;
    }
  }
}
