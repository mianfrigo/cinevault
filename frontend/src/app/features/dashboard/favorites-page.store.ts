import { isPlatformBrowser } from '@angular/common';
import { computed, inject, PLATFORM_ID } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { FavoritesStore } from '../../core/favorites/favorites.store';
import { FavoriteItem, MediaTypeParam, Paged } from '../../core/models';

export type FavoritesFilter = 'all' | MediaTypeParam;

/** How long a removal can be undone before the DELETE is sent. */
export const UNDO_MS = 5000;

interface PendingRemoval {
  key: string;
  item: FavoriteItem;
}

interface State {
  type: FavoritesFilter;
  page: number;
  /** The server's list of the current page. A pending removal stays in it (hidden by `visibleItems`) until its DELETE is sent. */
  items: FavoriteItem[];
  /** Number of saved titles in the current filter (all pages). */
  total: number;
  /** The empty list reports 0 pages. */
  totalPages: number;
  /** Starts as 'loading': the page always loads first, and the server renders the skeleton. */
  status: 'idle' | 'loading' | 'error';
  pendingRemoval: PendingRemoval | null;
  /** Title of the last removal the API refused (cleared by the next removal or load). */
  removeFailed: string | null;
}

export const favoriteKey = (i: Pick<FavoriteItem, 'mediaType' | 'tmdbId'>) =>
  `${i.mediaType}:${i.tmdbId}`;

/**
 * State of the favorites page (component-level: provide it in the page). The URL decides type and
 * page; `setType`/`setPage` load them. A removal hides the item and waits `UNDO_MS` for an undo
 * before the DELETE goes out; a second removal, leaving the page or the timer ends it sooner.
 */
export const FavoritesPageStore = signalStore(
  withState<State>({
    type: 'all',
    page: 1,
    items: [],
    total: 0,
    totalPages: 0,
    status: 'loading',
    pendingRemoval: null,
    removeFailed: null,
  }),
  withComputed(({ items, total, type, pendingRemoval }) => ({
    visibleItems: computed(() => {
      const hidden = pendingRemoval()?.key;
      return items().filter((i) => favoriteKey(i) !== hidden);
    }),
    // A pending title of another filter is not among these titles, so it is not subtracted.
    visibleTotal: computed(() => {
      const pending = pendingRemoval();
      const counts = pending && (type() === 'all' || pending.item.mediaType === type());
      return Math.max(total() - (counts ? 1 : 0), 0);
    }),
  })),
  withMethods((store) => {
    const api = inject(ApiClient);
    const hearts = inject(FavoritesStore);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));

    let timer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;
    /** Removals whose DELETE is in flight: a list that was loaded meanwhile must not bring them back. */
    const gone = new Set<string>();

    const load = rxMethod<{ type: FavoritesFilter; page: number }>(
      pipe(
        tap(() => patchState(store, { status: 'loading' })),
        switchMap(({ type, page }) =>
          api
            .get<Paged<FavoriteItem>>('/me/favorites', {
              type: type === 'all' ? undefined : type,
              page,
            })
            .pipe(
              tapResponse({
                next: (res) =>
                  patchState(store, {
                    items: res.items.filter((i) => !gone.has(favoriteKey(i))),
                    total: res.totalItems,
                    totalPages: res.totalPages,
                    status: 'idle',
                  }),
                error: () =>
                  patchState(store, { items: [], total: 0, totalPages: 0, status: 'error' }),
              }),
            ),
        ),
      ),
    );

    const reload = () => load({ type: store.type(), page: store.page() });

    /** Hides the item for good at once and sends its DELETE. */
    const send = ({ key, item }: PendingRemoval) => {
      gone.add(key);
      // Only a title of the loaded list is part of the total (the filter may have changed since).
      patchState(store, (s) => ({
        items: s.items.filter((i) => favoriteKey(i) !== key),
        total: Math.max(s.total - (s.items.some((i) => favoriteKey(i) === key) ? 1 : 0), 0),
      }));
      api.delete<void>(`/me/favorites/${item.mediaType}/${item.tmdbId}`).subscribe({
        next: () => {
          gone.delete(key);
          hearts.setSaved(item.mediaType, item.tmdbId, false);
          hearts.unhide(item.mediaType, item.tmdbId); // after setSaved: the count never ticks back up
          // Fills the page up again (and corrects the page count).
          if (!destroyed) reload();
        },
        error: () => {
          gone.delete(key);
          hearts.unhide(item.mediaType, item.tmdbId); // still saved: counted again
          if (destroyed) return;
          patchState(store, { removeFailed: item.title });
          reload();
        },
      });
    };

    /** Sends the pending DELETE now, if there is one. */
    const flush = () => {
      clearTimeout(timer);
      timer = undefined;
      const pending = store.pendingRemoval();
      if (!pending) return;
      patchState(store, { pendingRemoval: null });
      send(pending);
    };

    const show = (type: FavoritesFilter, page: number) => {
      // Another filter shows other titles, so the old ones go; another page keeps them until it arrives.
      patchState(store, (s) =>
        s.type === type
          ? { page, removeFailed: null }
          : { type, page, removeFailed: null, items: [], total: 0, totalPages: 0 },
      );
      reload();
    };

    return {
      /** Loads this filter and page (the page component calls it with what the URL says). */
      show,
      setType: (type: FavoritesFilter) => show(type, 1),
      setPage: (page: number) => show(store.type(), page),
      reload,

      remove(item: FavoriteItem): void {
        flush();
        patchState(store, { pendingRemoval: { key: favoriteKey(item), item }, removeFailed: null });
        hearts.hide(item.mediaType, item.tmdbId);
        // Only a browser has a user who can undo; elsewhere there is nothing to wait for.
        if (browser) timer = setTimeout(flush, UNDO_MS);
        else flush();
      },

      undo(): void {
        clearTimeout(timer);
        timer = undefined;
        const pending = store.pendingRemoval();
        if (pending) hearts.unhide(pending.item.mediaType, pending.item.tmdbId);
        patchState(store, { pendingRemoval: null });
      },

      flush,
      markDestroyed: () => (destroyed = true),
    };
  }),
  withHooks({
    onDestroy(store) {
      // Leaving the page must not lose the removal.
      store.markDestroyed();
      store.flush();
    },
  }),
);
