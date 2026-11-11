import { computed, effect, inject, untracked } from '@angular/core';
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
  withState<{ keys: string[] }>({ keys: [] }),
  withComputed(({ keys }) => ({ keySet: computed(() => new Set(keys())) })),
  withMethods((store) => {
    const api = inject(ApiClient);
    const auth = inject(AuthStore);
    const router = inject(Router);

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

    return {
      isFavorite: (type: MediaTypeParam, id: number) => store.keySet().has(keyOf(type, id)),

      async load(): Promise<void> {
        const touched = new Map<string, boolean>();
        overlays.add(touched);
        try {
          const ids = await firstValueFrom(api.get<FavoriteId[]>('/me/favorites/ids'));
          // The user may have logged out while the request was in flight.
          if (!auth.isLoggedIn()) return;
          patchState(store, { keys: ids.map((i) => keyOf(i.mediaType, i.tmdbId)) });
          touched.forEach((present, key) => setKey(key, present));
        } finally {
          overlays.delete(touched);
        }
      },

      /** Optimistic: flips the key at once, undoes only that key and rethrows if the API fails. */
      async toggle(type: MediaTypeParam, id: number): Promise<void> {
        if (!auth.isLoggedIn()) {
          await router.navigate(['/login'], { queryParams: { next: router.url } });
          return;
        }
        const key = keyOf(type, id);
        const was = store.keySet().has(key);
        const record = (present: boolean) => {
          setKey(key, present);
          overlays.forEach((o) => o.set(key, present));
        };
        record(!was);
        try {
          await firstValueFrom(
            was
              ? api.delete<void>(`/me/favorites/${type}/${id}`)
              : api.put<void>(`/me/favorites/${type}/${id}`),
          );
        } catch (e) {
          record(was);
          throw e;
        }
      },

      clear: () => patchState(store, { keys: [] }),
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
