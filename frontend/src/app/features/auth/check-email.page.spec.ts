import { setup } from './auth.testing';

describe('Check email page', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  const resendButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('p-button button')!;

  it('Check-email Resend button is disabled during the 30s countdown', async () => {
    const ctx = await setup('/check-email?email=ada%40example.com');
    expect(ctx.text()).toContain('ada@example.com');
    expect(resendButton(ctx.el).disabled).toBe(true);

    vi.advanceTimersByTime(29_000);
    ctx.harness.detectChanges();
    expect(resendButton(ctx.el).disabled).toBe(true);

    vi.advanceTimersByTime(1_000);
    ctx.harness.detectChanges();
    expect(resendButton(ctx.el).disabled).toBe(false);

    resendButton(ctx.el).click();
    const req = await ctx.request('resend-verification');
    expect(req.request.body).toEqual({ email: 'ada@example.com' });
    req.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    await ctx.seeText('Sent again.');
    expect(resendButton(ctx.el).disabled).toBe(true); // the countdown restarts
  });

  it('asks for the address when the link has no email', async () => {
    const ctx = await setup('/check-email');
    expect(ctx.el.querySelector('input#email')).not.toBeNull();
  });

  it('does not crash on a repeated email param and falls back to the resend form', async () => {
    const ctx = await setup('/check-email?email=a%40b.co&email=c%40d.co');
    expect(ctx.el.querySelector('input#email')).not.toBeNull();
  });

  it('starts no timer when the page was left before the resend finished', async () => {
    const ctx = await setup('/check-email?email=ada%40example.com');
    vi.advanceTimersByTime(30_000);
    ctx.harness.detectChanges();
    resendButton(ctx.el).click();
    const req = await ctx.request('resend-verification');
    await ctx.harness.navigateByUrl('/privacy');
    expect(vi.getTimerCount()).toBe(0);
    req.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
    await vi.waitFor(() => expect(ctx.url()).toBe('/privacy'));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });
});
