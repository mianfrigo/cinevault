import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import {
  MAIL_LIMIT,
  MAIL_WINDOW_MS,
  MailBudgetService,
} from './mail-budget.service';

/** A cache that honours ttls against a clock the test moves. */
function setup() {
  let now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const store = new Map<string, { value: unknown; expires: number }>();
  const cache = {
    get: jest.fn((k: string) => {
      const hit = store.get(k);
      return Promise.resolve(hit && hit.expires > now ? hit.value : undefined);
    }),
    set: jest.fn((k: string, value: unknown, ttl: number) => {
      store.set(k, { value, expires: now + ttl });
      return Promise.resolve(value);
    }),
  } as unknown as Cache;
  return {
    budget: new MailBudgetService(cache),
    cache,
    store,
    advance: (ms: number) => (now += ms),
  };
}

describe('MailBudgetService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('allows the limit, then refuses until the window of the first mail is over', async () => {
    const { budget, advance } = setup();
    for (let i = 0; i < MAIL_LIMIT; i++) {
      expect(await budget.take('reset', 'a@example.com')).toBe(true);
      advance(1_000);
    }
    expect(await budget.take('reset', 'a@example.com')).toBe(false);
    advance(MAIL_WINDOW_MS); // refused calls do not extend the window
    expect(await budget.take('reset', 'a@example.com')).toBe(true);
  });

  it('counts each kind and each recipient on its own', async () => {
    const { budget } = setup();
    for (let i = 0; i < MAIL_LIMIT; i++)
      await budget.take('reset', 'a@example.com');
    expect(await budget.take('reset', 'a@example.com')).toBe(false);
    expect(await budget.take('verify', 'a@example.com')).toBe(true);
    expect(await budget.take('reset', 'b@example.com')).toBe(true);
  });

  it('keeps no address in the cache key', async () => {
    const { budget, store } = setup();
    await budget.take('reset', 'victim@example.com');
    expect([...store.keys()].join()).not.toContain('victim');
  });

  it('lets the mail go when the cache fails (a cache outage must not block a password reset)', async () => {
    const { budget, cache } = setup();
    (cache.get as jest.Mock).mockRejectedValue(new Error('redis down'));
    expect(await budget.take('reset', 'a@example.com')).toBe(true);
  });
});
