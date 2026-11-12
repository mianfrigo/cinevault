import { AdminOverview } from '@core/models';
import { error, openAdmin, person } from './admin.testing';

const overview = (extra: Partial<AdminOverview> = {}): AdminOverview => ({
  totalUsers: 1234,
  newThisWeek: 17,
  recentSignups: [
    person(1, { name: 'Ines Okafor', status: 'ACTIVE', createdAt: '2026-11-08T10:00:00.000Z' }),
    person(2, { name: 'Suri Calloway', status: 'PENDING', createdAt: '2026-11-07T23:59:00.000Z' }),
    person(3, { name: 'Nell Abernathy', status: 'BLOCKED', createdAt: '2026-10-01T00:00:00.000Z' }),
  ],
  ...extra,
});

const answer = (ctx: Awaited<ReturnType<typeof openAdmin>>) =>
  vi.waitFor(() => {
    ctx.harness.detectChanges();
    return ctx.http.expectOne('/api/v1/admin/overview');
  });

describe('Admin overview page', () => {
  it('Overview renders both numbers and the recent sign-ups', async () => {
    const ctx = await openAdmin('/admin/overview');
    (await answer(ctx)).flush(overview());
    await ctx.settle();

    const figures = Array.from(ctx.el.querySelectorAll('dl > div')).map((d) => d.textContent);
    expect(figures[0]).toContain('Total users');
    expect(figures[0]).toContain('1234');
    expect(figures[1]).toContain('New this week');
    expect(figures[1]).toContain('17');

    const items = Array.from(ctx.el.querySelectorAll('section li'));
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Ines Okafor');
    expect(items[0].textContent).toContain('user1@example.test');
    expect(items[0].textContent).toContain('Active');
    expect(items[0].textContent).toContain('8 Nov 2026');
    expect(items[1].textContent).toContain('Pending');
    // 23:59 UTC stays on the 7th in every time zone.
    expect(items[1].textContent).toContain('7 Nov 2026');
    expect(items[2].textContent).toContain('Blocked');
    ctx.http.match(() => true);
  });

  it('links to all users and has one h1 and a labelled list', async () => {
    const ctx = await openAdmin('/admin/overview');
    (await answer(ctx)).flush(overview());
    await ctx.settle();

    const link = Array.from(ctx.el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('View all users'),
    );
    expect(link?.getAttribute('href')).toBe('/admin/users');
    expect(ctx.el.querySelectorAll('h1')).toHaveLength(1);
    expect(ctx.el.querySelector('section')?.getAttribute('aria-labelledby')).toBe('h-recent');
    expect(ctx.el.querySelector('#h-recent')?.textContent).toContain('Recent signups');
    ctx.http.match(() => true);
  });

  it('zero users and no sign-ups still render', async () => {
    const ctx = await openAdmin('/admin/overview');
    (await answer(ctx)).flush(overview({ totalUsers: 1, newThisWeek: 0, recentSignups: [] }));
    await ctx.settle();
    expect(ctx.el.querySelector('dl')?.textContent).toContain('0');
    expect(ctx.el.textContent).toContain('No one has signed up yet.');
    ctx.http.match(() => true);
  });

  it('shows a skeleton while loading', async () => {
    const ctx = await openAdmin('/admin/overview');
    await answer(ctx);
    expect(ctx.el.querySelector('[role=status]')?.textContent).toContain('Loading');
    expect(ctx.el.querySelector('dl')).toBeNull();
    ctx.http.match(() => true);
  });

  it('shows an error with Retry and loads again on Retry', async () => {
    const ctx = await openAdmin('/admin/overview');
    const e = error(500, 'INTERNAL');
    (await answer(ctx)).flush(e.body, e.init);
    await ctx.settle();
    expect(ctx.el.querySelector('[role=alert]')?.textContent).toContain('Could not load');
    expect(ctx.text()).not.toContain('raw server text');

    Array.from(ctx.el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Retry')!
      .click();
    (await answer(ctx)).flush(overview());
    await ctx.settle();
    expect(ctx.el.querySelector('dl')?.textContent).toContain('1234');
    ctx.http.match(() => true);
  });
});
