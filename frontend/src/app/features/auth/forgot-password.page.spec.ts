import { TestBed } from '@angular/core/testing';
import { error, setup } from './auth.testing';

describe('Forgot password page', () => {
  it('Forgot password shows the neutral message for both 202 responses', async () => {
    for (const body of [{ message: 'queued-by-server' }, { message: 'nothing-happened' }]) {
      const ctx = await setup('/forgot-password');
      ctx.type('#email', 'someone@example.com');
      ctx.submit();
      const req = await ctx.request('forgot-password');
      expect(req.request.body).toEqual({ email: 'someone@example.com' });
      req.flush(body, { status: 202, statusText: 'Accepted' });
      await ctx.seeText('If that email exists, we sent a link.');
      expect(ctx.text()).not.toContain(body.message);
      TestBed.resetTestingModule();
    }
  });

  it('moves focus to the email field after a blocked submit and to the banner after a server error', async () => {
    const ctx = await setup('/forgot-password');
    ctx.type('#email', 'nope');
    ctx.submit();
    await vi.waitFor(() => expect(document.activeElement).toBe(ctx.el.querySelector('#email')));

    ctx.type('#email', 'a@example.com');
    (ctx.el.querySelector('#email') as HTMLElement).blur();
    ctx.submit();
    const broken = error(500, 'INTERNAL');
    (await ctx.request('forgot-password')).flush(broken.body, broken.init);
    await ctx.seeText('Something went wrong.');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(ctx.el.querySelector('p-message[role="alert"]')),
    );
  });

  it('blocks an invalid email and maps 429 and other failures', async () => {
    const ctx = await setup('/forgot-password');
    ctx.type('#email', 'not-an-email');
    ctx.submit();
    await ctx.settle();
    ctx.http.expectNone('/api/v1/auth/forgot-password');
    expect(ctx.text()).toContain('Enter a valid email address.');

    ctx.type('#email', 'a@example.com');
    ctx.submit();
    const limited = error(429, 'RATE_LIMITED');
    (await ctx.request('forgot-password')).flush(limited.body, limited.init);
    await ctx.seeText('Too many attempts. Try again in a minute.');
    expect(ctx.text()).not.toContain('If that email exists');

    ctx.submit();
    const broken = error(500, 'INTERNAL');
    (await ctx.request('forgot-password')).flush(broken.body, broken.init);
    await ctx.seeText('Something went wrong. Please try again.');
  });
});
