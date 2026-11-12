import { TestBed } from '@angular/core/testing';
import { error, setup } from './auth.testing';

describe('Verify email page', () => {
  it('Verify page calls /auth/verify-email once with the token and shows success', async () => {
    const ctx = await setup('/verify-email?token=tok-123');
    const req = await ctx.request('verify-email'); // expectOne: a second call would fail here
    expect(req.request.body).toEqual({ token: 'tok-123' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await ctx.seeText('Your email is verified.');
    expect(ctx.text()).toContain('Log in');
    ctx.http.expectNone('/api/v1/auth/verify-email');
  });

  it('shows the expired and invalid states with a resend form', async () => {
    for (const [code, copy] of [
      ['TOKEN_EXPIRED', 'This verification link has expired.'],
      ['TOKEN_INVALID', 'This verification link is not valid.'],
    ]) {
      const ctx = await setup('/verify-email?token=tok');
      const failed = error(400, code);
      (await ctx.request('verify-email')).flush(failed.body, failed.init);
      await ctx.seeText(copy);

      ctx.type('#email', 'ada@example.com');
      ctx.submit();
      const resend = await ctx.request('resend-verification');
      expect(resend.request.body).toEqual({ email: 'ada@example.com' });
      resend.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
      await ctx.seeText('If that account needs verifying, we sent a new link.');
      TestBed.resetTestingModule();
    }
  });

  it('does not call the API when the token is missing', async () => {
    const ctx = await setup('/verify-email');
    await ctx.settle();
    ctx.http.expectNone('/api/v1/auth/verify-email');
    expect(ctx.text()).toContain('This verification link is not valid.');
  });
});
