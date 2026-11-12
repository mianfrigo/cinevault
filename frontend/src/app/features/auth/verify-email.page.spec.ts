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

  it('shows a rate limit message for 429 and a neutral one for 5xx, never "not valid"', async () => {
    for (const [status, code, copy] of [
      [429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.'],
      [500, 'INTERNAL', 'Something went wrong. Please try again.'],
    ] as const) {
      const ctx = await setup('/verify-email?token=tok');
      const failed = error(status, code);
      (await ctx.request('verify-email')).flush(failed.body, failed.init);
      await ctx.seeText(copy);
      expect(ctx.text()).not.toContain('not valid');
      expect(ctx.text()).not.toContain('expired');
      expect(ctx.text()).not.toContain('raw server text');
      TestBed.resetTestingModule();
    }
  });

  it('Retry calls verify again once per click and keeps the token after it left the URL', async () => {
    const ctx = await setup('/verify-email?token=tok-7');
    const failed = error(500, 'INTERNAL');
    (await ctx.request('verify-email')).flush(failed.body, failed.init);
    await ctx.seeText('Something went wrong.');
    ctx.http.expectNone('/api/v1/auth/verify-email');

    Array.from(ctx.el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Retry'))!
      .click();
    const again = await ctx.request('verify-email');
    expect(again.request.body).toEqual({ token: 'tok-7' });
    again.flush(null, { status: 204, statusText: 'No Content' });
    await ctx.seeText('Your email is verified.');
  });

  it('drops the token from the address bar without a second verify call', async () => {
    const ctx = await setup('/verify-email?token=tok-8');
    const req = await ctx.request('verify-email');
    await vi.waitFor(() => expect(ctx.url()).toBe('/verify-email'));
    req.flush(null, { status: 204, statusText: 'No Content' });
    await ctx.seeText('Your email is verified.');
    ctx.http.expectNone('/api/v1/auth/verify-email');
  });

  it('treats a repeated token param as invalid without calling the API', async () => {
    const ctx = await setup('/verify-email?token=a&token=b');
    await ctx.seeText('This verification link is not valid.');
    ctx.http.expectNone('/api/v1/auth/verify-email');
  });
});
