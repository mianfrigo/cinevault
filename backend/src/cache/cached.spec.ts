import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { cached } from './cached';

const fakeCache = (over: Partial<Record<'get' | 'set', unknown>> = {}) => {
  const store = new Map<string, unknown>();
  return {
    store,
    cache: {
      get: jest.fn((k: string) => Promise.resolve(store.get(k))),
      set: jest.fn((k: string, v: unknown) => {
        store.set(k, v);
        return Promise.resolve(v);
      }),
      ...over,
    } as unknown as Cache,
  };
};

describe('cached', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('loads once, then serves from the cache with the ttl in ms', async () => {
    const { cache } = fakeCache();
    const load = jest.fn().mockResolvedValue({ a: 1 });
    expect(await cached(cache, 'k', 1000, load)).toEqual({ a: 1 });
    expect(await cached(cache, 'k', 1000, load)).toEqual({ a: 1 });
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('k', { a: 1 }, 1000);
  });

  it('returns the loaded value when the cache throws on get and set', async () => {
    const boom = () => Promise.reject(new Error('redis://user:secret@host'));
    const { cache } = fakeCache({ get: boom, set: boom });
    const load = jest.fn().mockResolvedValue('fresh');
    await expect(cached(cache, 'k', 1000, load)).resolves.toBe('fresh');
    // Nothing from the cache error (could hold a URL with credentials) is logged.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('propagates a load error and does not cache it', async () => {
    const { cache, store } = fakeCache();
    const load = jest.fn().mockRejectedValue(new Error('502'));
    await expect(cached(cache, 'k', 1000, load)).rejects.toThrow('502');
    expect(store.size).toBe(0);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
