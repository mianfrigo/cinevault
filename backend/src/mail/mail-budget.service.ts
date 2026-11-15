import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';

export const MAIL_LIMIT = 3;
export const MAIL_WINDOW_MS = 60 * 60 * 1000;

type Window = { count: number; resetAt: number };

/**
 * How many mails of one kind one recipient gets per hour. The per-IP limit on the routes does not stop
 * many callers from mailing one address, or from voiding its earlier link by asking again. `take`
 * is called before a mail is made: false means do not issue a token and do not send, and the route
 * answers as usual, so the budget tells nobody anything.
 */
@Injectable()
export class MailBudgetService {
  private readonly log = new Logger(MailBudgetService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * `who` is the address (or account id) the mail concerns. Fixed window from the first mail.
   * ponytail: the cache is evictable and read-then-write, so a burst of parallel calls can overshoot
   * by a few and an evicted key resets the count; a table of sends is the upgrade if that matters.
   */
  async take(kind: string, who: string): Promise<boolean> {
    const key = `mail-budget:${kind}:${createHash('sha256').update(who).digest('hex')}`;
    try {
      const now = Date.now();
      const seen = await this.cache.get<Window>(key);
      if (seen && seen.count >= MAIL_LIMIT) {
        this.log.warn(`${kind} mail budget used up; not sending`);
        return false;
      }
      const resetAt = seen?.resetAt ?? now + MAIL_WINDOW_MS;
      await this.cache.set(
        key,
        { count: (seen?.count ?? 0) + 1, resetAt },
        resetAt - now,
      );
    } catch (e) {
      // Open on failure: a cache outage must not stop a password reset.
      this.log.warn(`mail budget unavailable: ${(e as Error).name}`);
    }
    return true;
  }
}
