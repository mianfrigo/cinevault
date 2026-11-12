import { computed, inject } from '@angular/core';
import { tapResponse } from '@ngrx/operators';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import { ApiClient, toApiError } from '../../core/api/api-client';
import { Paged, Role, UserDto, UserStatus } from '../../core/models';

/** The API serves 20 users per page. */
export const PAGE_SIZE = 20;
/** Longest search the API is asked for. */
export const QUERY_MAX = 100;

interface State {
  /** The search the list shows (trimmed). */
  query: string;
  page: number;
  /** The current page. It stays on screen while the next one loads, so keyboard focus is not lost. */
  items: UserDto[];
  /** Users matching the query, all pages. */
  total: number;
  /** Starts as 'loading': the page always loads first, and the server renders the skeleton. */
  status: 'idle' | 'loading' | 'error';
  /** Rows whose change is in flight: their controls are disabled and a second change is not sent. */
  busyIds: string[];
}

/** What a failed change reports: the API error code, 'RATE_LIMITED' for a 429, 'NETWORK_ERROR' without an answer. */
const codeOf = (error: unknown): string => {
  const e = toApiError(error);
  return e.statusCode === 429 ? 'RATE_LIMITED' : e.code;
};

/**
 * State of the admin users page (component-level: provide it in the page). The page asks `reload` for the
 * first load; `setQuery` (debounced) and `setPage` load the next list. One request at a time: a newer one
 * cancels the older, so a slow answer never overwrites a newer one. A row change resolves to `null` on success
 * (the row is patched from the answer) or to the error code, and leaves the row as it was.
 */
export const UsersPageStore = signalStore(
  withState<State>({ query: '', page: 1, items: [], total: 0, status: 'loading', busyIds: [] }),
  withComputed(({ total }) => ({
    totalPages: computed(() => Math.ceil(total() / PAGE_SIZE)),
  })),
  withMethods((store) => {
    const api = inject(ApiClient);

    const load = rxMethod<{ query: string; page: number }>(
      pipe(
        tap(() => patchState(store, { status: 'loading' })),
        switchMap(({ query, page }) =>
          api.get<Paged<UserDto>>('/admin/users', { q: query || undefined, page }).pipe(
            tapResponse({
              next: (res) =>
                patchState(store, { items: res.items, total: res.totalItems, status: 'idle' }),
              error: () => patchState(store, { items: [], total: 0, status: 'error' }),
            }),
          ),
        ),
      ),
    );

    const show = (page: number) => {
      patchState(store, { page });
      load({ query: store.query(), page });
    };

    /** Runs one change of a row: a row that is busy is left alone ('BUSY'), the rest report null or the error code. */
    const change = async <T>(
      id: string,
      request: () => Promise<T>,
      done: (result: T) => void,
    ): Promise<string | null> => {
      if (store.busyIds().includes(id)) return 'BUSY';
      patchState(store, (s) => ({ busyIds: [...s.busyIds, id] }));
      try {
        done(await request());
        return null;
      } catch (e) {
        return codeOf(e);
      } finally {
        patchState(store, (s) => ({ busyIds: s.busyIds.filter((b) => b !== id) }));
      }
    };
    const patchUser = (id: string, body: { role: Role } | { status: UserStatus }) =>
      change(
        id,
        () => firstValueFrom(api.patch<UserDto>(`/admin/users/${id}`, body)),
        (user) =>
          patchState(store, (s) => ({ items: s.items.map((i) => (i.id === id ? user : i)) })),
      );

    return {
      /** Loads the current query and page again (first load, Retry). */
      reload: () => load({ query: store.query(), page: store.page() }),

      /** The search box: waits for a pause in typing, skips the search that is already shown, starts at page 1. */
      setQuery: rxMethod<string>(
        pipe(
          map((q) => q.trim().slice(0, QUERY_MAX)),
          debounceTime(300),
          distinctUntilChanged(),
          filter((q) => q !== store.query()),
          tap((query) => patchState(store, { query, page: 1 })),
          tap((query) => load({ query, page: 1 })),
        ),
      ),
      setPage: show,

      changeRole: (id: string, role: Role) => patchUser(id, { role }),
      setStatus: (id: string, status: Exclude<UserStatus, 'PENDING'>) => patchUser(id, { status }),

      /** Deletes the user, then fills the page up again; a page that emptied steps back to the one before. */
      remove: (id: string) =>
        change(
          id,
          () => firstValueFrom(api.delete<void>(`/admin/users/${id}`)),
          () => {
            patchState(store, (s) => ({
              items: s.items.filter((i) => i.id !== id),
              total: Math.max(s.total - 1, 0),
            }));
            show(store.items().length === 0 ? Math.max(store.page() - 1, 1) : store.page());
          },
        ),
    };
  }),
);
