import { paged, setup, title } from './browse.testing';

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
