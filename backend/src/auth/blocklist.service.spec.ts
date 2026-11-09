import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { BlockListService } from './blocklist.service';

describe('BlockListService', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const boom = () => Promise.reject(new Error('redis://user:secret@host'));
  const broken = () =>
    new BlockListService({
      get: boom,
      set: boom,
      del: boom,
    } as unknown as Cache);

  it('stores blocked:<id> for 600000 ms, reads it and deletes it', async () => {
    const store = new Map<string, unknown>();
    const cache = {
      get: jest.fn((k: string) => Promise.resolve(store.get(k))),
      set: jest.fn((k: string, v: unknown) => Promise.resolve(store.set(k, v))),
      del: jest.fn((k: string) => Promise.resolve(store.delete(k))),
    };
    const svc = new BlockListService(cache as unknown as Cache);
    expect(await svc.isBlocked('u1')).toBe(false);
    await svc.block('u1');
    expect(cache.set).toHaveBeenCalledWith('blocked:u1', '1', 600_000);
    expect(await svc.isBlocked('u1')).toBe(true);
    expect(await svc.isBlocked('u2')).toBe(false);
    await svc.unblock('u1');
    expect(cache.del).toHaveBeenCalledWith('blocked:u1');
    expect(await svc.isBlocked('u1')).toBe(false);
  });

  it('treats a failing cache read as not blocked and warns once, with the error class only', async () => {
    const svc = broken();
    expect(await svc.isBlocked('u1')).toBe(false);
    expect(await svc.isBlocked('u1')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('Error');
    expect(logged).not.toContain('secret');
  });

  it('never throws from block or unblock when the cache fails', async () => {
    const svc = broken();
    await expect(svc.block('u1')).resolves.toBeUndefined();
    await expect(svc.unblock('u1')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
