import { Paged, UserDto } from '@core/models';
import { member, setup } from '../dashboard/dashboard.testing';

export { error } from '../dashboard/dashboard.testing';

/** The signed-in administrator of the specs. */
export const me: UserDto = { ...member, id: 'me', name: 'Root Admin', role: 'ADMIN' };

export const person = (n: number, extra: Partial<UserDto> = {}): UserDto => ({
  id: `u${n}`,
  email: `user${n}@example.test`,
  name: `User ${n}`,
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-05T23:30:00.000Z',
  ...extra,
});

export const usersOf = (items: UserDto[], page = 1, totalItems = items.length): Paged<UserDto> => ({
  items,
  page,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
});

/** Spec helper: the admin pages through the real route table, as this user. */
export async function openAdmin(url: string, user: UserDto = me) {
  const ctx = await setup(url, user);
  const shell = ctx.harness.fixture.nativeElement as HTMLElement;
  /** The users list request (any query): polls, since the page's effects send it after the first render. */
  const usersList = (params: Record<string, string | null> = {}) =>
    vi.waitFor(() => {
      ctx.harness.detectChanges();
      return ctx.http.expectOne(
        (r) =>
          r.url === '/api/v1/admin/users' &&
          Object.entries(params).every(([k, v]) => r.params.get(k) === v),
      );
    });
  return { ...ctx, shell, usersList };
}
