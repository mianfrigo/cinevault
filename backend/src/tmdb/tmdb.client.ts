import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { ENV, type Env } from '../config/env';

export interface TmdbClientOptions {
  timeoutMs?: number;
  /** Wait before the single retry when TMDB sends no Retry-After. */
  retryDelayMs?: number;
}

const ADULT_FILTERED =
  /^\/(trending|discover|search)|\/(popular|top_rated|now_playing|on_the_air)/;
const MAX_RETRY_AFTER_MS = 2000;

const unavailable = () =>
  new AppException(502, 'TMDB_UNAVAILABLE', 'Movie database is unavailable');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class TmdbClient {
  private readonly log = new Logger(TmdbClient.name);
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Optional() options: TmdbClientOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.retryDelayMs = options.retryDelayMs ?? 300;
  }

  async get<T>(
    path: string,
    query: Record<string, string | number> = {},
  ): Promise<T> {
    const params = new URLSearchParams({ language: 'en-US' });
    if (ADULT_FILTERED.test(path)) params.set('include_adult', 'false');
    for (const [k, v] of Object.entries(query)) params.set(k, String(v));
    const url = `${this.env.tmdbBaseUrl}${path}?${params}`;

    for (let attempt = 1; ; attempt++) {
      let retryAfterMs: number | undefined;
      try {
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.env.tmdbReadToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.ok) return (await res.json()) as T;
        if (res.status === 404) {
          throw new AppException(404, 'NOT_FOUND', 'Title not found');
        }
        if (res.status !== 429 && res.status < 500) {
          // 401 and friends: our configuration is wrong, retrying cannot help.
          this.log.warn(`TMDB ${path} rejected the request: ${res.status}`);
          throw unavailable();
        }
        const secs = Number(res.headers.get('retry-after'));
        if (secs >= 0 && res.headers.has('retry-after')) {
          retryAfterMs = Math.min(secs * 1000, MAX_RETRY_AFTER_MS);
        }
        this.log.warn(`TMDB ${path} failed: ${res.status}`);
      } catch (e) {
        if (e instanceof AppException) throw e;
        // Only the error name is logged: never the URL or headers.
        this.log.warn(`TMDB ${path} failed: ${(e as Error).name}`);
      }
      if (attempt === 2) throw unavailable();
      await sleep(retryAfterMs ?? this.retryDelayMs);
    }
  }
}
