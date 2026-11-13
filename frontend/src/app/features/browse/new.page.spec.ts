import { RESPONSE_INIT } from '@angular/core';
import { paged, setup, title } from './browse.testing';

const serverResponse = (): ResponseInit => ({ status: 200, headers: new Headers() });
const fail = { status: 500, statusText: 'Server Error' };

describe('New & Popular page', () => {
  it('shows a movies section and a tv section from the new lists', async () => {
    const { http, el, settle, request } = await setup('/new');
    request('new', { type: 'movie', page: '1' }).flush(paged([title(1), title(2)]));
    request('new', { type: 'tv', page: '1' }).flush(paged([{ ...title(3), mediaType: 'tv' }]));
    await settle();
    const headings = Array.from(el.querySelectorAll('h2')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['New movies', 'New TV shows']);
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(3);
    http.verify();
  });

  it('answers 503 with Retry-After and no-store when neither list loads', async () => {
    const init = serverResponse();
    const { settle, request } = await setup('/new', [{ provide: RESPONSE_INIT, useValue: init }]);
    request('new', { type: 'movie', page: '1' }).flush(null, fail);
    request('new', { type: 'tv', page: '1' }).flush(null, fail);
    await settle();

    expect(init.status).toBe(503);
    expect(new Headers(init.headers).get('Retry-After')).toBe('30');
    expect(new Headers(init.headers).get('Cache-Control')).toBe('no-store');
  });

  it('stays a 200 but is not cached when only one list fails', async () => {
    const init = serverResponse();
    const { settle, request } = await setup('/new', [{ provide: RESPONSE_INIT, useValue: init }]);
    request('new', { type: 'movie', page: '1' }).flush(paged([title(1)]));
    request('new', { type: 'tv', page: '1' }).flush(null, fail);
    await settle();

    expect(init.status).toBe(200);
    expect(new Headers(init.headers).get('Cache-Control')).toBe('no-store');
    expect(new Headers(init.headers).get('Retry-After')).toBeNull();
  });

  it('keeps one section when the other fails and retries only that one', async () => {
    const { el, settle, request, next } = await setup('/new');
    request('new', { type: 'movie', page: '1' }).flush(paged([title(1)]));
    request('new', { type: 'tv', page: '1' }).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await settle();
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(1);
    const retry = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Retry'),
    );
    expect(retry).toHaveLength(1);
    retry[0].click();
    (await next('new', { type: 'tv', page: '1' })).flush(paged([{ ...title(3), mediaType: 'tv' }]));
    await settle();
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(2);
  });
});
