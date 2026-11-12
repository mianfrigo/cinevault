import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

const log = new Logger('Cache');

/**
 * Read-through cache. The cache is an optimisation only: its errors are logged
 * (error name only, messages can carry connection strings) and never thrown,
 * while errors from `load` propagate and are not cached. `ttlMs` may be a function
 * of the loaded value, to cache some results for less time.
 */
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlMs: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await cache.get<T>(key);
    if (hit !== undefined && hit !== null) return hit;
  } catch (e) {
    log.warn(`cache read failed: ${(e as Error).name}`);
  }
  const value = await load();
  try {
    await cache.set(
      key,
      value,
      typeof ttlMs === 'function' ? ttlMs(value) : ttlMs,
    );
  } catch (e) {
    log.warn(`cache write failed: ${(e as Error).name}`);
  }
  return value;
}
