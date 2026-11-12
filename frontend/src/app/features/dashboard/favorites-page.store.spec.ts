import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FavoritesStore } from '../../core/favorites/favorites.store';
import { FavoriteItem, Paged } from '../../core/models';
import { FavoritesPageStore } from './favorites-page.store';

const fav = (tmdbId: number, extra: Partial<FavoriteItem> = {}): FavoriteItem => ({
  tmdbId,
  mediaType: 'movie',
  title: `Title ${tmdbId}`,
  year: 2024,
  rating: 7,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
  addedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const paged = (items: FavoriteItem[], page = 1, totalPages = 1): Paged<FavoriteItem> => ({
  items,
  page,
  totalPages,
  totalItems: items.length,
});

@Component({ selector: 'cv-page-host', template: '', providers: [FavoritesPageStore] })
class PageHost {}

describe('FavoritesPageStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof FavoritesPageStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FavoritesPageStore],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(FavoritesPageStore);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  const list = (params: Record<string, string | null>) =>
    http.expectOne(
      (r) =>
        r.url === '/api/v1/me/favorites' &&
        Object.entries(params).every(([k, v]) => r.params.get(k) === v),
    );
  const deletes = (id: number) => http.match(`/api/v1/me/favorites/movie/${id}`);

  /** Loads the list and answers it, so there is something to remove. */
  function loaded(items: FavoriteItem[]) {
    store.setType('all');
    list({ type: null, page: '1' }).flush(paged(items));
  }

  it("FavoritesPageStore.setType('tv') requests type=tv and page 1", () => {
    store.setPage(3);
    list({ type: null, page: '3' }).flush(paged([fav(1)], 3, 4));
    store.setType('tv');
    expect(store.type()).toBe('tv');
    expect(store.page()).toBe(1);
    list({ type: 'tv', page: '1' }).flush(paged([fav(2, { mediaType: 'tv' })]));
    expect(store.items().map((i) => i.tmdbId)).toEqual([2]);
    expect(store.status()).toBe('idle');
  });

  it('keeps the previous items while the next page loads and drops them on a failure', () => {
    loaded([fav(1)]);
    store.setPage(2);
    expect(store.status()).toBe('loading');
    expect(store.items()).toHaveLength(1);
    list({ page: '2' }).flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('error');
    expect(store.items()).toEqual([]);
  });

  it('reports an empty list as zero pages', () => {
    store.setType('all');
    list({ page: '1' }).flush({ items: [], page: 1, totalPages: 0, totalItems: 0 });
    expect(store.totalPages()).toBe(0);
    expect(store.visibleItems()).toEqual([]);
  });

  it('remove then undo sends no DELETE', () => {
    loaded([fav(1), fav(2)]);
    store.remove(fav(1));
    expect(store.visibleItems().map((i) => i.tmdbId)).toEqual([2]);
    store.undo();
    expect(store.visibleItems().map((i) => i.tmdbId)).toEqual([1, 2]);
    vi.advanceTimersByTime(10_000);
    expect(deletes(1)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('remove then waiting 5s sends DELETE once', () => {
    loaded([fav(1), fav(2)]);
    store.remove(fav(1));
    vi.advanceTimersByTime(4_999);
    expect(deletes(1)).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const sent = deletes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].request.method).toBe('DELETE');
    sent[0].flush(null, { status: 204, statusText: 'No Content' });
    // the page is reloaded so it fills up again
    list({ page: '1' }).flush(paged([fav(2)]));
    vi.advanceTimersByTime(10_000);
    expect(deletes(1)).toHaveLength(0);
    expect(store.pendingRemoval()).toBeNull();
  });

  it('a second remove sends the first DELETE immediately', () => {
    loaded([fav(1), fav(2), fav(3)]);
    store.remove(fav(1));
    store.remove(fav(2));
    const first = deletes(1);
    expect(first).toHaveLength(1);
    expect(deletes(2)).toHaveLength(0);
    expect(store.pendingRemoval()?.key).toBe('movie:2');
    // the first item stays hidden while its DELETE is in flight, the second is hidden as pending
    expect(store.visibleItems().map((i) => i.tmdbId)).toEqual([3]);
    vi.advanceTimersByTime(5_000);
    expect(deletes(2)).toHaveLength(1);
  });

  it('leaving the page with a removal pending still sends the DELETE and leaves no timer', () => {
    // Component-level, as in the app: the page's injector goes away while the app's keeps running.
    const fixture = TestBed.createComponent(PageHost);
    const baseline = vi.getTimerCount();
    const pageStore = fixture.debugElement.injector.get(FavoritesPageStore);
    pageStore.show('all', 1);
    list({ type: null, page: '1' }).flush(paged([fav(1)]));
    pageStore.remove(fav(1));
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(baseline);
    const sent = http.match('/api/v1/me/favorites/movie/1');
    expect(sent).toHaveLength(1);
    sent[0].flush(null, { status: 204, statusText: 'No Content' });
  });

  it('keeps the hearts store in step once a removal is confirmed', async () => {
    const hearts = TestBed.inject(FavoritesStore);
    TestBed.tick(); // its login effect runs now (a visitor: it clears), before the test sets a heart
    hearts.setSaved('movie', 1, true);
    loaded([fav(1)]);
    store.remove(fav(1));
    expect(hearts.isFavorite('movie', 1)).toBe(true);
    vi.advanceTimersByTime(5_000);
    deletes(1)[0].flush(null, { status: 204, statusText: 'No Content' });
    expect(hearts.isFavorite('movie', 1)).toBe(false);
    list({ page: '1' }).flush(paged([]));
  });

  it('brings the item back and reports it when the DELETE fails', () => {
    loaded([fav(1)]);
    store.remove(fav(1));
    vi.advanceTimersByTime(5_000);
    deletes(1)[0].flush(null, { status: 500, statusText: 'Server Error' });
    expect(store.removeFailed()).toBe('Title 1');
    list({ page: '1' }).flush(paged([fav(1)]));
    expect(store.visibleItems().map((i) => i.tmdbId)).toEqual([1]);
  });
});
