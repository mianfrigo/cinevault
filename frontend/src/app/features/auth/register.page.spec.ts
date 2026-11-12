import { error, setup } from './auth.testing';

const fill = (ctx: Awaited<ReturnType<typeof setup>>, password: string, confirm: string) => {
  ctx.type('#name', 'Ada Lovelace');
  ctx.type('#email', 'ada@example.com');
  ctx.type('#password', password);
  ctx.type('#confirm', confirm);
};

describe('Register page', () => {
  it('Register blocks submit and shows errors for a 9-char password and a mismatched confirm', async () => {
    const ctx = await setup('/register');
    fill(ctx, '123456789', 'something-else');
    ctx.submit();
    await ctx.settle();

    ctx.http.expectNone('/api/v1/auth/register');
    expect(ctx.text()).toContain('Use at least 10 characters.');
    expect(ctx.text()).toContain('Passwords do not match.');
    expect(ctx.el.querySelector('#password')?.classList).toContain('p-invalid');
    expect(ctx.el.querySelector('#confirm')?.classList).toContain('p-invalid');
  });

  it('Register success navigates to /check-email', async () => {
    const ctx = await setup('/register');
    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    ctx.submit();

    const req = await ctx.request('register');
    expect(req.request.body).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'a-long-enough-pass',
    });
    req.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    await vi.waitFor(() => expect(ctx.url()).toBe('/check-email?email=ada@example.com'));
  });

  it('moves focus to the first invalid control and links controls to their error text', async () => {
    const ctx = await setup('/register');
    ctx.type('#name', 'Ada');
    ctx.type('#email', 'ada@example.com');
    ctx.type('#password', '123456789');
    ctx.type('#confirm', '123456789');
    ctx.submit();
    await vi.waitFor(() => expect(document.activeElement).toBe(ctx.el.querySelector('#password')));

    const password = ctx.el.querySelector('#password')!;
    await vi.waitFor(() => {
      ctx.harness.detectChanges();
      expect(password.getAttribute('aria-invalid')).toBe('true');
    });
    const described = ctx.el.querySelector('#' + password.getAttribute('aria-describedby'));
    expect(described?.textContent).toContain('Use at least 10 characters.');
    // A valid field is not marked and, with no hint, keeps no description.
    expect(ctx.el.querySelector('#name')?.getAttribute('aria-invalid')).toBeNull();
    expect(ctx.el.querySelector('#name')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('describes a pristine password field by its hint', async () => {
    const ctx = await setup('/register');
    const password = ctx.el.querySelector('#password')!;
    await vi.waitFor(() => {
      ctx.harness.detectChanges();
      const hint = ctx.el.querySelector('#' + password.getAttribute('aria-describedby'));
      expect(hint?.textContent).toContain('At least 10 characters, at most 128.');
    });
  });

  it('moves focus to the error banner after a server error', async () => {
    const ctx = await setup('/register');
    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    ctx.submit();
    const broken = error(500, 'INTERNAL');
    (await ctx.request('register')).flush(broken.body, broken.init);
    await ctx.seeText('Something went wrong.');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(ctx.el.querySelector('p-message[role="alert"]')),
    );
  });

  it('shows the rate limit message for 429 and a neutral retryable one otherwise', async () => {
    const ctx = await setup('/register');
    fill(ctx, 'a-long-enough-pass', 'a-long-enough-pass');
    ctx.submit();
    const limited = error(429, 'RATE_LIMITED');
    (await ctx.request('register')).flush(limited.body, limited.init);
    await ctx.seeText('Too many attempts. Try again in a minute.');

    ctx.submit();
    const broken = error(500, 'INTERNAL');
    (await ctx.request('register')).flush(broken.body, broken.init);
    await ctx.seeText('Something went wrong. Please try again.');
    expect(ctx.text()).not.toContain('raw server text');
    expect(ctx.url()).toBe('/register');
  });
});
