import { UserDto } from '../../core/models';
import { error, me, openAdmin, person, usersOf } from './admin.testing';
import { GENERIC_MESSAGE, RATE_LIMIT_MESSAGE } from '../auth/auth.api';
import { LAST_ADMIN_MESSAGE, SELF_ACTION_MESSAGE } from './users.page';

const mine = { ...me, createdAt: '2025-01-01T00:00:00.000Z' };
const users = (): UserDto[] => [mine, person(2), person(3, { status: 'BLOCKED' }), person(4)];

/** Opens /admin/users and answers its first list with these users. */
async function open(items: UserDto[] = users(), total = items.length) {
  const ctx = await openAdmin('/admin/users');
  (await ctx.usersList({ page: '1' })).flush(usersOf(items, 1, total));
  await ctx.settle();
  const rows = () => Array.from(ctx.el.querySelectorAll<HTMLElement>('tbody tr'));
  const row = (name: string) => rows().find((r) => r.textContent?.includes(name))!;
  const button = (r: HTMLElement, label: string) =>
    Array.from(r.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
  const overlay = () => document.body.querySelector<HTMLElement>('.p-confirmpopup');
  const patch = (id: string) =>
    ctx.request('PATCH', `/admin/users/${id}`).then((req) => {
      expect(req.request.method).toBe('PATCH');
      return req;
    });
  const conflict = (code: string) => ({
    body: { statusCode: 409, code, message: 'raw server text' },
    init: { status: 409, statusText: code },
  });
  return { ...ctx, rows, row, button, overlay, patch, conflict };
}

describe('Admin users page', () => {
  afterEach(() => {
    document.body.querySelectorAll('.p-confirmpopup, .p-select-overlay').forEach((e) => e.remove());
  });

  it('lists the users: avatar, name, email, role, status and the joined date (UTC)', async () => {
    const { rows, row, http, el } = await open();

    expect(rows()).toHaveLength(4);
    const ines = row('User 2');
    expect(ines.textContent).toContain('user2@example.test');
    expect(ines.textContent).toContain('Active');
    // 23:30 UTC on the 5th stays the 5th in every time zone.
    expect(ines.textContent).toContain('5 Jan 2026');
    expect(ines.querySelector('p-avatar')?.textContent?.trim()).toBe('U2');
    expect(row('User 3').textContent).toContain('Blocked');
    expect(el.querySelector('h1')?.textContent).toContain('Users');
    expect(el.textContent).toContain('4 users');
    http.match(() => true);
  });

  it('shows a loading skeleton first and no table', async () => {
    const ctx = await openAdmin('/admin/users');
    await ctx.usersList();
    expect(ctx.el.querySelector('[role=status]')?.textContent).toContain('Loading');
    expect(ctx.el.querySelector('table')).toBeNull();
    ctx.http.match(() => true);
  });

  it('own row controls are disabled with an explanation', async () => {
    const { row, button, http } = await open();
    const own = row('Root Admin');

    expect(own.textContent).toContain('You');
    expect(button(own, 'Block').disabled).toBe(true);
    expect(button(own, 'Delete').disabled).toBe(true);
    expect(own.querySelector('cv-role-select [role=combobox]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
    const titles = Array.from(own.querySelectorAll('[title]')).map((e) => e.getAttribute('title'));
    expect(titles).toEqual([
      'You cannot change your own role',
      'You cannot block yourself',
      'You cannot delete yourself',
    ]);
    expect(button(own, 'Block').getAttribute('aria-label')).toContain('you cannot block yourself');

    // Another row is free.
    expect(button(row('User 2'), 'Block').disabled).toBe(false);
    expect(row('User 2').querySelector('[title]')).toBeNull();
    http.match(() => true);
  });

  it('blocking calls PATCH with {status:"BLOCKED"} and the row shows Blocked', async () => {
    const { row, button, patch, seeText, http, settle, harness, text } = await open();
    button(row('User 2'), 'Block').click();
    const req = await patch('u2');
    expect(req.request.body).toEqual({ status: 'BLOCKED' });
    // The row is disabled while the request is in flight.
    harness.detectChanges();
    expect(button(row('User 2'), 'Block').disabled).toBe(true);

    req.flush(person(2, { status: 'BLOCKED' }));
    await seeText('User 2 is blocked and signed out.');
    await settle();
    expect(row('User 2').textContent).toContain('Blocked');
    expect(button(row('User 2'), 'Unblock')).toBeTruthy();
    expect(button(row('User 2'), 'Unblock').disabled).toBe(false);
    expect(text()).toContain('is blocked');
    http.match(() => true);
  });

  it('unblocking sends {status:"ACTIVE"}', async () => {
    const { row, button, patch, settle, http } = await open();
    button(row('User 3'), 'Unblock').click();
    const req = await patch('u3');
    expect(req.request.body).toEqual({ status: 'ACTIVE' });
    req.flush(person(3));
    await settle();
    expect(row('User 3').textContent).toContain('Active');
    http.match(() => true);
  });

  // jsdom has no matchMedia, which the select's overlay asks for.
  beforeAll(() => {
    window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  it('changing a role calls PATCH with {role} and the row shows the answer', async () => {
    const { row, patch, settle, harness, http } = await open();
    row('User 2').querySelector<HTMLElement>('[role=combobox]')!.click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role=option]')).find(
      (o) => o.textContent?.trim() === 'Admin',
    )!;
    option.click();
    harness.detectChanges();

    const req = await patch('u2');
    expect(req.request.body).toEqual({ role: 'ADMIN' });
    req.flush(person(2, { role: 'ADMIN' }));
    await settle();
    expect(row('User 2').querySelector('[role=combobox]')?.textContent).toContain('Admin');
    http.match(() => true);
  });

  it('a LAST_ADMIN error leaves the row unchanged and shows the message', async () => {
    const items = [mine, person(2, { role: 'ADMIN' })];
    const { row, button, patch, conflict, seeText, text, http } = await open(items);
    button(row('User 2'), 'Block').click();
    const { body, init } = conflict('LAST_ADMIN');
    (await patch('u2')).flush(body, init);

    await seeText(LAST_ADMIN_MESSAGE);
    expect(row('User 2').textContent).toContain('Active');
    expect(button(row('User 2'), 'Block').disabled).toBe(false);
    expect(text()).not.toContain('raw server text');
    http.match(() => true);
  });

  it('a SELF_ACTION error shows its message and leaves the row alone', async () => {
    const { row, button, patch, conflict, seeText, http } = await open();
    button(row('User 4'), 'Block').click();
    const { body, init } = conflict('SELF_ACTION');
    (await patch('u4')).flush(body, init);
    await seeText(SELF_ACTION_MESSAGE);
    expect(row('User 4').textContent).toContain('Active');
    http.match(() => true);
  });

  it('any other failure shows a neutral message, never the server text, and can be retried', async () => {
    const { row, button, patch, seeText, text, http } = await open();
    button(row('User 2'), 'Block').click();
    const e = error(500, 'INTERNAL');
    (await patch('u2')).flush(e.body, e.init);
    await seeText(GENERIC_MESSAGE);
    expect(text()).not.toContain('raw server text');

    // The row is free again: the same action can be tried once more.
    expect(button(row('User 2'), 'Block').disabled).toBe(false);
    button(row('User 2'), 'Block').click();
    expect(await patch('u2')).toBeTruthy();
    http.match(() => true);
  });

  it('a rate limit says so', async () => {
    const { row, button, patch, seeText, http } = await open();
    button(row('User 2'), 'Block').click();
    (await patch('u2')).flush(
      { message: 'ThrottlerException' },
      { status: 429, statusText: 'Too Many' },
    );
    await seeText(RATE_LIMIT_MESSAGE);
    http.match(() => true);
  });

  it('a busy row sends one request however often it is clicked', async () => {
    const { row, button, harness, http } = await open();
    const block = button(row('User 2'), 'Block');
    block.click();
    block.click();
    harness.detectChanges();
    block.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(http.match((r) => r.method === 'PATCH')).toHaveLength(1);
    });
    http.match(() => true);
  });

  it('delete needs the confirm step before DELETE is sent', async () => {
    const { row, button, overlay, harness, request, rows, seeText, http } = await open();
    const trigger = button(row('User 2'), 'Delete');
    trigger.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(overlay()).not.toBeNull();
    });
    http.expectNone((r) => r.method === 'DELETE');
    expect(overlay()?.textContent).toContain('Delete User 2 and their favorites?');
    expect(overlay()?.getAttribute('role')).toBe('alertdialog');

    Array.from(overlay()!.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    const req = await request('DELETE', '/admin/users/u2');
    req.flush(null, { status: 204, statusText: 'No Content' });
    // The page fills up again.
    (await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/admin/users'))).flush(
      usersOf([mine, person(3, { status: 'BLOCKED' }), person(4)]),
    );
    await seeText('Deleted User 2 and their favorites.');
    expect(rows().some((r) => r.textContent?.includes('User 2'))).toBe(false);
    http.match(() => true);
  });

  it('Cancel sends nothing and the keyboard returns to the Delete button', async () => {
    const { row, button, overlay, harness, http } = await open();
    const trigger = button(row('User 2'), 'Delete');
    trigger.focus();
    trigger.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(overlay()).not.toBeNull();
    });
    Array.from(overlay()!.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();
    harness.detectChanges();

    http.expectNone((r) => r.method === 'DELETE');
    expect(document.activeElement).toBe(trigger);
    http.match(() => true);
  });

  it('Escape cancels the confirm step without sending anything', async () => {
    const { row, button, overlay, harness, http } = await open();
    const trigger = button(row('User 2'), 'Delete');
    trigger.focus();
    trigger.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(overlay()).not.toBeNull();
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    harness.detectChanges();

    http.expectNone((r) => r.method === 'DELETE');
    expect(document.activeElement).toBe(trigger);
    http.match(() => true);
  });

  it('a refused delete keeps the row, says why, and gives the keyboard back to Delete', async () => {
    const { row, button, overlay, harness, request, seeText, conflict, rows, http } = await open();
    const trigger = button(row('User 2'), 'Delete');
    trigger.focus();
    trigger.click();
    await vi.waitFor(() => {
      harness.detectChanges();
      expect(overlay()).not.toBeNull();
    });
    Array.from(overlay()!.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    const { body, init } = conflict('LAST_ADMIN');
    (await request('DELETE', '/admin/users/u2')).flush(body, init);

    await seeText(LAST_ADMIN_MESSAGE);
    expect(rows()).toHaveLength(4);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    http.match(() => true);
  });

  it('shows the matches of the search as text, with no markup of the query', async () => {
    const { type, harness, http, el, usersList } = await open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const hostile = '<img src=x onerror=alert(1)>';
      type('#user-search', hostile);
      await vi.advanceTimersByTimeAsync(300);
      (await usersList({ q: hostile, page: '1' })).flush(usersOf([]));
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(el.textContent).toContain(`No users match “${hostile}”.`);
      expect(el.querySelector('img')).toBeNull();
      expect(el.querySelector('table')).toBeNull();
      http.match(() => true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a pause in typing, keeps focus in the search box and keeps the rows while it loads', async () => {
    const { type, harness, http, el, usersList, rows } = await open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const input = el.querySelector<HTMLInputElement>('#user-search')!;
      input.focus();
      type('#user-search', 'ines');
      await vi.advanceTimersByTimeAsync(299);
      http.expectNone((r) => r.url === '/api/v1/admin/users');

      await vi.advanceTimersByTimeAsync(1);
      const req = await usersList({ q: 'ines', page: '1' });
      harness.detectChanges();
      // The previous rows stay, dimmed, until the answer arrives.
      expect(rows()).toHaveLength(4);
      expect(el.querySelector('[aria-busy=true]')).not.toBeNull();
      expect(document.activeElement).toBe(input);

      req.flush(usersOf([person(9, { name: 'Ines Okafor' })]));
      harness.detectChanges();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(rows()).toHaveLength(1);
      expect(document.activeElement).toBe(input);
      expect(document.activeElement).not.toBe(document.body);
      http.match(() => true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('steps back a page when a delete empties the last one', async () => {
    const ctx = await openAdmin('/admin/users');
    (await ctx.usersList({ page: '1' })).flush(usersOf([mine], 1, 21));
    await ctx.settle();
    // Page 2 holds the 21st user alone.
    ctx.el.querySelector<HTMLElement>('nav[aria-label=Pagination] [aria-label="Page 2"]')!.click();
    (await ctx.usersList({ page: '2' })).flush(usersOf([person(21)], 2, 21));
    await ctx.settle();

    const trigger = Array.from(ctx.el.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Delete User 21',
    )!;
    trigger.click();
    await vi.waitFor(() => {
      ctx.harness.detectChanges();
      expect(document.body.querySelector('.p-confirmpopup')).not.toBeNull();
    });
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('.p-confirmpopup button'))
      .find((b) => b.textContent?.trim() === 'Delete')!
      .click();
    (await ctx.request('DELETE', '/admin/users/u21')).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    // The list asks for page 1 again.
    (await ctx.usersList({ page: '1' })).flush(usersOf([mine], 1, 20));
    await ctx.settle();
    expect(ctx.el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(ctx.el.querySelector('nav[aria-label=Pagination]')).toBeNull();
    // The keyboard goes to the heading, not to the body.
    await vi.waitFor(() => expect(document.activeElement).toBe(ctx.el.querySelector('h1')));
    ctx.http.match(() => true);
  });

  it('pages with the paginator and asks for that page', async () => {
    const ctx = await openAdmin('/admin/users');
    (await ctx.usersList({ page: '1' })).flush(usersOf(users(), 1, 45));
    await ctx.settle();
    expect(ctx.text()).toContain('45 users');

    ctx.el.querySelector<HTMLElement>('nav[aria-label=Pagination] [aria-label="Page 3"]')!.click();
    (await ctx.usersList({ page: '3' })).flush(usersOf([person(41)], 3, 45));
    await ctx.settle();
    expect(ctx.el.querySelectorAll('tbody tr')).toHaveLength(1);
    ctx.http.match(() => true);
  });

  it('says so when there are no users at all', async () => {
    const { el, http } = await open([], 0);
    expect(el.textContent).toContain('There are no users yet.');
    http.match(() => true);
  });

  it('shows an error with Retry when the list cannot load', async () => {
    const ctx = await openAdmin('/admin/users');
    const e = error(500, 'INTERNAL');
    (await ctx.usersList()).flush(e.body, e.init);
    await ctx.settle();
    expect(ctx.el.querySelector('[role=alert]')?.textContent).toContain('Could not load users');
    expect(ctx.text()).not.toContain('raw server text');

    Array.from(ctx.el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Retry')!
      .click();
    (await ctx.usersList({ page: '1' })).flush(usersOf(users()));
    await ctx.settle();
    expect(ctx.el.querySelectorAll('tbody tr')).toHaveLength(4);
    ctx.http.match(() => true);
  });

  it('labels the search box and every control by the user it acts on', async () => {
    const { el, row, http } = await open();
    expect(el.querySelector('label[for=user-search]')?.textContent).toContain('Search users');
    expect(
      row('User 2').querySelector('cv-role-select [role=combobox]')?.getAttribute('aria-label'),
    ).toBe('Role for User 2');
    const labels = Array.from(row('User 2').querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toContain('Block User 2');
    expect(labels).toContain('Delete User 2');
    http.match(() => true);
  });
});
