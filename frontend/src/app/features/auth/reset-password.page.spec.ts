import { TestBed } from '@angular/core/testing';
import { error, setup } from './auth.testing';

const fill = (ctx: Awaited<ReturnType<typeof setup>>, password: string, confirm: string) => {
  ctx.type('#password', password);
  ctx.type('#confirm', confirm);
  ctx.submit();
};

describe('Reset password page', () => {
  it('Reset page shows the expired state for TOKEN_EXPIRED', async () => {
    const ctx = await setup('/reset-password?token=tok');
    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    const failed = error(400, 'TOKEN_EXPIRED');
    (await ctx.request('reset-password')).flush(failed.body, failed.init);
    await ctx.seeText('This reset link has expired.');
    expect(ctx.text()).toContain('Request a new link');
    expect(ctx.el.querySelector('form')).toBeNull();
  });

  it('shows the invalid state for TOKEN_INVALID and for a missing token', async () => {
    const ctx = await setup('/reset-password?token=tok');
    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    const failed = error(400, 'TOKEN_INVALID');
    (await ctx.request('reset-password')).flush(failed.body, failed.init);
    await ctx.seeText('This reset link is not valid.');
    TestBed.resetTestingModule();

    const missing = await setup('/reset-password');
    expect(missing.text()).toContain('This reset link is not valid.');
    expect(missing.el.querySelector('form')).toBeNull();
  });

  it('validates the new password, sends it with the token in the body and goes to login', async () => {
    const ctx = await setup('/reset-password?token=tok-9');
    fill(ctx, 'short', 'different');
    await ctx.settle();
    ctx.http.expectNone('/api/v1/auth/reset-password');
    expect(ctx.text()).toContain('Use at least 10 characters.');
    expect(ctx.text()).toContain('Passwords do not match.');

    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    const req = await ctx.request('reset-password');
    expect(req.request.url).not.toContain('tok-9');
    expect(req.request.body).toEqual({ token: 'tok-9', newPassword: 'a-long-enough-pass' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(ctx.url()).toBe('/login?notice=password-reset'));
  });
});
