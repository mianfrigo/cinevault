import { isPlatformBrowser } from '@angular/common';
import { computed, effect, inject, PLATFORM_ID, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { AuthStore } from '../auth/auth.store';
import { FavoriteId, MediaTypeParam } from '../models';

const keyOf = (type: MediaTypeParam, id: number) => `${type}:${id}`;

export const FavoritesStore = signalStore(
  { providedIn: 'root' },
  withState<{ keys: string[]; loaded: boolean; hidden: string[] }>({
    keys: [],
    // True once the ids have arrived: before that a count would read 0 for a user who has favorites.
    loaded: false,
    // Keys whose removal is pending or in flight on the favorites page: still saved, but not counted.
    hidden: [],
  }),
  withComputed(({ keys, loaded, hidden }) => ({
    keySet: computed(() => new Set(keys())),
    /** Saved titles as the favorites page shows them (a pending removal is already gone); null until loaded. */
    counts: computed(() => {
      if (!loaded()) return null;
      const gone = new Set(hidden());
      const shown = keys().filter((k) => !gone.has(k));
      const movie = shown.filter((k) => k.startsWith('movie:')).length;
      return { all: shown.length, movie, tv: shown.length - movie };
    }),
  })),
  withMethods((store) => {
    const api = inject(ApiClient);
    const auth = inject(AuthStore);
    const router = inject(Router);
    const browser = isPlatformBrowser(inject(PLATFORM_ID));

    // Toggles made while a load is in flight, per load: the response is older than they are, so they win.
    const overlays = new Set<Map<string, boolean>>();

    const setKey = (key: string, present: boolean) =>
      patchState(store, ({ keys }) => ({
        keys: present
          ? keys.includes(key)
            ? keys
            : [...keys, key]
          : keys.filter((k) => k !== key),
      }));

    // The key is set now; a load that is still in flight must not overwrite it with older data.
    const record = (key: string, present: boolean) => {
      setKey(key, present);
      overlays.forEach((o) => o.set(key, present));
    };

    return {
      isFavorite: (type: MediaTypeParam, id: number) => store.keySet().has(keyOf(type, id)),

      async load(): Promise<void> {
        const touched = new Map<string, boolean>();
        overlays.add(touched);
        try {
          const ids = await firstValueFrom(api.get<FavoriteId[]>('/me/favorites/ids'));
          // The user may have logged out while the request was in flight.
          if (!auth.isLoggedIn()) return;
          patchState(store, { keys: ids.map((i) => keyOf(i.mediaType, i.tmdbId)), loaded: true });
          touched.forEach((present, key) => setKey(key, present));
        } finally {
          overlays.delete(touched);
        }
      },

      /** Optimistic: flips the key at once, undoes only that key and rethrows if the API fails. */
      async toggle(type: MediaTypeParam, id: number): Promise<void> {
        // A click before the session restore finished must not be taken for a visitor (bounded by the 3 s timeout).
        if (browser && !auth.ready()) await auth.whenReady();
        if (!auth.isLoggedIn()) {
          await router.navigate(['/login'], { queryParams: { next: router.url } });
          return;
        }
        const key = keyOf(type, id);
        const was = store.keySet().has(key);
        record(key, !was);
        try {
          await firstValueFrom(
            was
              ? api.delete<void>(`/me/favorites/${type}/${id}`)
              : api.put<void>(`/me/favorites/${type}/${id}`),
          );
        } catch (e) {
          record(key, was);
          throw e;
        }
      },

      /** Sets a heart without a request, for when the API already changed it (a confirmed removal on the favorites page). */
      setSaved: (type: MediaTypeParam, id: number, saved: boolean) =>
        record(keyOf(type, id), saved),

      /** The favorites page hides a title while its removal waits for Undo (or its DELETE is in flight): it is not counted. */
      hide: (type: MediaTypeParam, id: number) =>
        patchState(store, ({ hidden }) => ({ hidden: [...hidden, keyOf(type, id)] })),
      unhide: (type: MediaTypeParam, id: number) =>
        patchState(store, ({ hidden }) => ({
          hidden: hidden.filter((k) => k !== keyOf(type, id)),
        })),

      clear: () => patchState(store, { keys: [], loaded: false, hidden: [] }),
    };
  }),
  withHooks({
    onInit(store) {
      const auth = inject(AuthStore);
      effect(() => {
        const loggedIn = auth.isLoggedIn();
        untracked(() => {
          if (loggedIn)
            store.load().catch(() => undefined); // hearts stay empty; not worth an error UI
          else store.clear();
        });
      });
    },
  }),
);
