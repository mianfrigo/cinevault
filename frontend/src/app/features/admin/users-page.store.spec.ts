import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Paged, UserDto } from '../../core/models';
import { UsersPageStore } from './users-page.store';

const user = (n: number, extra: Partial<UserDto> = {}): UserDto => ({
  id: `u${n}`,
  email: `user${n}@example.test`,
  name: `User ${n}`,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const paged = (items: UserDto[], page = 1, totalItems = items.length): Paged<UserDto> => ({
  items,
  page,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
});

describe('UsersPageStore', () => {
  let http: HttpTestingController;
  let store: InstanceType<typeof UsersPageStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UsersPageStore],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(UsersPageStore);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      vi.useRealTimers();
    }
  });

  const list = (params: Record<string, string | null>) =>
    http.expectOne(
      (r) =>
        r.url === '/api/v1/admin/users' &&
        Object.entries(params).every(([k, v]) => r.params.get(k) === v),
    );
  /** Loads the first page with these users. */
  const loaded = (items: UserDto[], total = items.length) => {
    store.reload();
    list({ page: '1', q: null }).flush(paged(items, 1, total));
  };

  it('starts loading and shows the users of the first page once they arrive', () => {
    expect(store.status()).toBe('loading');
    loaded([user(1), user(2)], 45);
    expect(store.status()).toBe('idle');
    expect(store.items().map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(store.total()).toBe(45);
    expect(store.totalPages()).toBe(3);
  });

  it('setQuery waits 300ms and requests ?q=', () => {
    loaded([user(1)]);
    store.setQuery('ada');
    vi.advanceTimersByTime(299);
    http.expectNone(() => true);

    vi.advanceTimersByTime(1);
    list({ q: 'ada', page: '1' }).flush(paged([user(2, { name: 'Ada' })]));
    expect(store.query()).toBe('ada');
    expect(store.items().map((u) => u.name)).toEqual(['Ada']);
  });

  it('only the last keystroke of a burst is requested, trimmed and capped', () => {
    loaded([user(1)]);
    store.setQuery('a');
    vi.advanceTimersByTime(200);
    store.setQuery('  ad  ');
    vi.advanceTimersByTime(300);
    list({ q: 'ad' }).flush(paged([]));

    store.setQuery('x'.repeat(150));
    vi.advanceTimersByTime(300);
    list({ q: 'x'.repeat(100) }).flush(paged([]));
  });

  it('does not request again for the query that is already shown, and a new query goes back to page 1', () => {
    loaded([user(1)], 60);
    store.setPage(3);
    list({ page: '3' }).flush(paged([user(41)], 3, 60));

    store.setQuery('');
    vi.advanceTimersByTime(300);
    http.expectNone(() => true);

    store.setQuery('zed');
    vi.advanceTimersByTime(300);
    list({ q: 'zed', page: '1' }).flush(paged([]));
    expect(store.page()).toBe(1);
  });

  it('keeps the previous rows while the next page loads', () => {
    loaded([user(1), user(2)], 40);
    store.setPage(2);
    expect(store.status()).toBe('loading');
    expect(store.items()).toHaveLength(2);
    list({ page: '2' }).flush(paged([user(21)], 2, 40));
    expect(store.items().map((u) => u.id)).toEqual(['u21']);
  });

  it('never lets a stale response overwrite a newer one', () => {
    loaded([user(1)], 60);
    store.setPage(2);
    const slow = list({ page: '2' });
    store.setPage(3);
    const fast = list({ page: '3' });

    fast.flush(paged([user(41)], 3, 60));
    expect(slow.cancelled).toBe(true);
    expect(store.items().map((u) => u.id)).toEqual(['u41']);
    expect(store.page()).toBe(3);
  });

  it('a failed load shows the error state and reload tries again', () => {
    store.reload();
    list({ page: '1' }).flush({}, { status: 500, statusText: 'Server Error' });
    expect(store.status()).toBe('error');
    expect(store.items()).toEqual([]);

    store.reload();
    expect(store.status()).toBe('loading');
    list({ page: '1' }).flush(paged([user(1)]));
    expect(store.status()).toBe('idle');
  });

  describe('changing a row', () => {
    const patch = (id: string) => http.expectOne((r) => r.url === `/api/v1/admin/users/${id}`);

    it('changing a role calls PATCH with {role} and patches the row from the answer', async () => {
      loaded([user(1), user(2)]);
      const done = store.changeRole('u2', 'ADMIN');
      expect(store.busyIds()).toEqual(['u2']);
      const req = patch('u2');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ role: 'ADMIN' });
      req.flush(user(2, { role: 'ADMIN' }));

      expect(await done).toBeNull();
      expect(store.items()[1].role).toBe('ADMIN');
      expect(store.items()[0].role).toBe('USER');
      expect(store.busyIds()).toEqual([]);
    });

    it('blocking calls PATCH with {status:"BLOCKED"} and unblocking with ACTIVE', async () => {
      loaded([user(1), user(2)]);
      const blocking = store.setStatus('u2', 'BLOCKED');
      const req = patch('u2');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ status: 'BLOCKED' });
      req.flush(user(2, { status: 'BLOCKED' }));
      expect(await blocking).toBeNull();
      expect(store.items()[1].status).toBe('BLOCKED');

      const unblocking = store.setStatus('u2', 'ACTIVE');
      const back = patch('u2');
      expect(back.request.body).toEqual({ status: 'ACTIVE' });
      back.flush(user(2));
      await unblocking;
      expect(store.items()[1].status).toBe('ACTIVE');
    });

    it('returns the API error code and leaves the row unchanged', async () => {
      loaded([user(1, { role: 'ADMIN' })]);
      const done = store.changeRole('u1', 'USER');
      patch('u1').flush(
        { statusCode: 409, code: 'LAST_ADMIN', message: 'raw' },
        { status: 409, statusText: 'Conflict' },
      );
      expect(await done).toBe('LAST_ADMIN');
      expect(store.items()[0].role).toBe('ADMIN');
      expect(store.busyIds()).toEqual([]);
    });

    it('reports a rate limit as RATE_LIMITED even when the body has no code', async () => {
      loaded([user(1)]);
      const done = store.setStatus('u1', 'BLOCKED');
      patch('u1').flush(
        { statusCode: 429, message: 'ThrottlerException' },
        { status: 429, statusText: 'Too Many Requests' },
      );
      expect(await done).toBe('RATE_LIMITED');
    });

    it('reports a network failure with a code of its own', async () => {
      loaded([user(1)]);
      const done = store.changeRole('u1', 'ADMIN');
      patch('u1').error(new ProgressEvent('error'));
      expect(await done).toBe('NETWORK_ERROR');
    });

    it('sends one request for a row that is busy; other rows stay free', async () => {
      loaded([user(1), user(2)]);
      const first = store.setStatus('u2', 'BLOCKED');
      const second = store.setStatus('u2', 'BLOCKED');
      expect(await second).toBe('BUSY');
      const other = store.changeRole('u1', 'ADMIN');
      expect(store.busyIds().sort()).toEqual(['u1', 'u2']);

      patch('u2').flush(user(2, { status: 'BLOCKED' }));
      patch('u1').flush(user(1, { role: 'ADMIN' }));
      await Promise.all([first, other]);
      expect(store.busyIds()).toEqual([]);
    });
  });

  describe('remove', () => {
    const del = (id: string) =>
      http.expectOne((r) => r.method === 'DELETE' && r.url === `/api/v1/admin/users/${id}`);

    it('sends DELETE, drops the row and fills the page up again', async () => {
      loaded([user(1), user(2)], 22);
      const done = store.remove('u2');
      del('u2').flush(null, { status: 204, statusText: 'No Content' });
      expect(await done).toBeNull();
      expect(store.items().map((u) => u.id)).toEqual(['u1']);
      expect(store.total()).toBe(21);
      list({ page: '1' }).flush(paged([user(1), user(3)], 1, 21));
      expect(store.items().map((u) => u.id)).toEqual(['u1', 'u3']);
    });

    it('steps back a page when the last row of the last page is deleted', async () => {
      loaded([user(1)], 21);
      store.setPage(2);
      list({ page: '2' }).flush(paged([user(21)], 2, 21));

      const done = store.remove('u21');
      del('u21').flush(null, { status: 204, statusText: 'No Content' });
      await done;
      expect(store.page()).toBe(1);
      list({ page: '1' }).flush(paged([user(1)], 1, 20));
    });

    it('keeps the row and returns the code when the API refuses', async () => {
      loaded([user(1), user(2)]);
      const done = store.remove('u2');
      del('u2').flush(
        { statusCode: 409, code: 'SELF_ACTION', message: 'raw' },
        { status: 409, statusText: 'Conflict' },
      );
      expect(await done).toBe('SELF_ACTION');
      expect(store.items().map((u) => u.id)).toEqual(['u1', 'u2']);
      expect(store.busyIds()).toEqual([]);
    });
  });
});
