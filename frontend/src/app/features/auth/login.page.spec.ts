import { TestBed } from '@angular/core/testing';
import { error, setup } from './auth.testing';

const user = {
  id: 'u1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function logIn(url = '/login') {
  const ctx = await setup(url);
  ctx.type('#email', 'ada@example.com');
  ctx.type('#password', 'correct horse');
  ctx.submit();
  return { ...ctx, req: await ctx.request('login') };
}

describe('Login page', () => {
  it('Login maps EMAIL_NOT_VERIFIED to the resend message and ACCOUNT_BLOCKED to the blocked message', async () => {
    const ctx = await logIn();
    const unverified = error(403, 'EMAIL_NOT_VERIFIED');
    ctx.req.flush(unverified.body, unverified.init);
    await ctx.seeText('Your email is not verified yet.');
    const resend = Array.from(ctx.el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Resend verification email'),
    )!;
    resend.click();
    const resendReq = await ctx.request('resend-verification');
    expect(resendReq.request.body).toEqual({ email: 'ada@example.com' });
    resendReq.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    await ctx.seeText('Verification email sent');

    ctx.submit();
    const blocked = error(403, 'ACCOUNT_BLOCKED');
    (await ctx.request('login')).flush(blocked.body, blocked.init);
    await ctx.seeText('This account has been blocked.');
    expect(ctx.text()).not.toContain('Your email is not verified yet.');
  });

  it('maps INVALID_CREDENTIALS, rate limiting and unknown failures without raw server text', async () => {
    const ctx = await logIn();
    const wrong = error(401, 'INVALID_CREDENTIALS');
    ctx.req.flush(wrong.body, wrong.init);
    await ctx.seeText('Email or password is incorrect.');

    ctx.submit();
    const limited = error(429, 'RATE_LIMITED');
    (await ctx.request('login')).flush(limited.body, limited.init);
    await ctx.seeText('Too many attempts. Try again in a minute.');

    ctx.submit();
    const broken = error(500, 'INTERNAL');
    (await ctx.request('login')).flush(broken.body, broken.init);
    await ctx.seeText('Something went wrong. Please try again.');
    expect(ctx.text()).not.toContain('raw server text');
  });

  it('sends JSON credentials and goes to /dashboard/favorites without a next param', async () => {
    const ctx = await logIn();
    expect(ctx.req.request.body).toEqual({ email: 'ada@example.com', password: 'correct horse' });
    ctx.req.flush({ accessToken: 't', user });
    await vi.waitFor(() => expect(ctx.url()).toBe('/dashboard/favorites'));
  });

  it('goes to a same-origin next path after login', async () => {
    const ctx = await logIn('/login?next=%2Fprivacy');
    ctx.req.flush({ accessToken: 't', user });
    await vi.waitFor(() => expect(ctx.url()).toBe('/privacy'));
  });

  it('Login ignores a next param that is an absolute external URL', async () => {
    for (const next of [
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/\tevil.example',
      '/a b',
    ]) {
      const ctx = await logIn(`/login?next=${encodeURIComponent(next)}`);
      ctx.req.flush({ accessToken: 't', user });
      await vi.waitFor(() => expect(ctx.url()).toBe('/dashboard/favorites'));
      TestBed.resetTestingModule();
    }
  });

  it('shows a notice only for known keys', async () => {
    const known = await setup('/login?notice=password-reset');
    expect(known.text()).toContain('Your password was changed.');
    TestBed.resetTestingModule();
    const unknown = await setup('/login?notice=%3Cb%3Ehi%3C%2Fb%3E');
    expect(unknown.text()).not.toContain('hi');
    expect(unknown.el.querySelector('p-message')).toBeNull();
  });

  it('ignores a next param that is percent-encoded //, or repeated', async () => {
    for (const query of ['next=%2F%2Fevil.com', 'next=%2Fprivacy&next=%2Fterms']) {
      const ctx = await logIn('/login?' + query);
      ctx.req.flush({ accessToken: 't', user });
      await vi.waitFor(() => expect(ctx.url()).toBe('/dashboard/favorites'));
      TestBed.resetTestingModule();
    }
  });

  it('shows no notice for a repeated notice param', async () => {
    const ctx = await setup('/login?notice=password-reset&notice=password-reset');
    expect(ctx.el.querySelector('p-message')).toBeNull();
  });

  it('announces the password-changed notice politely', async () => {
    const ctx = await setup('/login?notice=password-reset');
    const notice = ctx.el.querySelector('p-message')!;
    expect(
      notice.getAttribute('role') === 'status' || notice.closest('[role="status"]'),
    ).toBeTruthy();
  });

  it('resends to the address that failed to log in, even if the field changed since', async () => {
    const ctx = await logIn();
    const unverified = error(403, 'EMAIL_NOT_VERIFIED');
    ctx.req.flush(unverified.body, unverified.init);
    await ctx.seeText('Your email is not verified yet.');
    ctx.type('#email', 'someone-else@example.com');
    Array.from(ctx.el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Resend verification email'))!
      .click();
    const resend = await ctx.request('resend-verification');
    expect(resend.request.body).toEqual({ email: 'ada@example.com' });
    resend.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
  });

  it('moves focus to the first invalid control after a blocked submit and to the banner after a server error', async () => {
    const ctx = await setup('/login');
    ctx.submit();
    await vi.waitFor(() => expect(document.activeElement).toBe(ctx.el.querySelector('#email')));

    ctx.type('#email', 'ada@example.com');
    ctx.type('#password', 'x');
    ctx.submit();
    const wrong = error(401, 'INVALID_CREDENTIALS');
    (await ctx.request('login')).flush(wrong.body, wrong.init);
    await ctx.seeText('Email or password is incorrect.');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(ctx.el.querySelector('p-message[role="alert"]')),
    );
  });
});
