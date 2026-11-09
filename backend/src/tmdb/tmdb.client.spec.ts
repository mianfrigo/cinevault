import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { Env } from '../config/env';
import { TmdbClient } from './tmdb.client';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

describe('TmdbClient', () => {
  let server: Server;
  let baseUrl: string;
  let requests: IncomingMessage[];
  let handler: Handler;

  const env = (url: string) =>
    ({ tmdbBaseUrl: url, tmdbReadToken: 'secret-token' }) as Env;
  const client = (timeoutMs?: number) =>
    new TmdbClient(env(baseUrl), { timeoutMs, retryDelayMs: 5 });
  const json = (
    res: ServerResponse,
    status: number,
    body: unknown,
    headers = {},
  ) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const caught = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return e as AppException;
    }
    throw new Error('expected rejection');
  };
  const query = (i: number) => new URL(requests[i].url!, baseUrl).searchParams;

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(req);
      handler(req, res);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    requests = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends Bearer token, language=en-US', async () => {
    handler = (_req, res) => json(res, 200, { ok: true });
    await expect(
      client().get('/movie/603', { append_to_response: 'credits' }),
    ).resolves.toEqual({ ok: true });
    expect(requests[0].headers.authorization).toBe('Bearer secret-token');
    expect(new URL(requests[0].url!, baseUrl).pathname).toBe('/movie/603');
    expect(query(0).get('language')).toBe('en-US');
    expect(query(0).get('append_to_response')).toBe('credits');
  });

  it('adds include_adult=false on /search/multi and never on /movie/603', async () => {
    handler = (_req, res) => json(res, 200, {});
    const c = client();
    await c.get('/search/multi', { query: 'matrix' });
    await c.get('/movie/603');
    await c.get('/movie/popular');
    expect(query(0).get('include_adult')).toBe('false');
    expect(query(1).has('include_adult')).toBe(false);
    expect(query(2).get('include_adult')).toBe('false');
  });

  it('maps 404 to NOT_FOUND', async () => {
    handler = (_req, res) => json(res, 404, { status_message: 'nope' });
    const e = await caught(client().get('/movie/1'));
    expect(e).toBeInstanceOf(AppException);
    expect([e.getStatus(), e.code]).toEqual([404, 'NOT_FOUND']);
    expect(requests).toHaveLength(1);
  });

  it('retries once on 429 then succeeds', async () => {
    let n = 0;
    handler = (_req, res) =>
      ++n === 1
        ? json(res, 429, {}, { 'retry-after': '0' })
        : json(res, 200, { ok: 1 });
    await expect(client().get('/movie/603')).resolves.toEqual({ ok: 1 });
    expect(requests).toHaveLength(2);
  });

  it('throws TMDB_UNAVAILABLE after repeated 500', async () => {
    handler = (_req, res) => json(res, 500, {});
    const e = await caught(client().get('/movie/603'));
    expect([e.getStatus(), e.code]).toEqual([502, 'TMDB_UNAVAILABLE']);
    expect(requests).toHaveLength(2);
  });

  it('throws TMDB_UNAVAILABLE on timeout', async () => {
    handler = () => undefined; // never responds
    const e = await caught(client(50).get('/movie/603'));
    expect([e.getStatus(), e.code]).toEqual([502, 'TMDB_UNAVAILABLE']);
    expect(requests).toHaveLength(2);
  });

  it('does not retry other 4xx and never leaks the token', async () => {
    handler = (_req, res) =>
      json(res, 401, { status_message: 'Invalid API key' });
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const e = await caught(client().get('/movie/603'));
    expect([e.getStatus(), e.code]).toEqual([502, 'TMDB_UNAVAILABLE']);
    expect(requests).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify([e.message, warn.mock.calls])).not.toContain(
      'secret-token',
    );
  });

  it('maps a network error to TMDB_UNAVAILABLE', async () => {
    const dead = new TmdbClient(env('http://127.0.0.1:1'), {
      retryDelayMs: 5,
    });
    const e = await caught(dead.get('/movie/603'));
    expect([e.getStatus(), e.code]).toEqual([502, 'TMDB_UNAVAILABLE']);
  });
});
