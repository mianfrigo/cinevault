import { TestBed } from '@angular/core/testing';
import { AuthStore } from '../../core/auth/auth.store';
import { error, member, setup } from './dashboard.testing';

const noContent = { status: 204, statusText: 'No Content' };

/** The account page with its hearts load answered. */
async function account(user = member) {
  const ctx = await setup('/dashboard/account', user);
  await ctx.settle();
  const hasText = (text: string) => ctx.text().includes(text);
  const submitButton = (form: string) =>
    document.querySelector<HTMLButtonElement>(`${form} button[type="submit"]`)!;
  /** Types into a field of the page or of the dialog (it is rendered outside the page). */
  const typeIn = (selector: string, value: string) => {
    const input = document.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    ctx.harness.detectChanges();
  };
  return { ...ctx, hasText, submitButton, typeIn };
}

describe('Account page', () => {
  describe('profile', () => {
    it('saves the trimmed name with PATCH /me and updates the signed in user', async () => {
      const ctx = await account();
      expect(ctx.el.querySelector<HTMLInputElement>('#name')!.value).toBe('Ada');
      ctx.type('#name', '  Ada Lovelace ');
      ctx.submit('#profile-form');
      const req = await ctx.request('PATCH', '/me');
      expect(req.request.body).toEqual({ name: 'Ada Lovelace' });
      req.flush({ ...member, name: 'Ada Lovelace' });
      await ctx.seeText('Name saved.');
      expect(TestBed.inject(AuthStore).user()?.name).toBe('Ada Lovelace');
    });

    it('blocks an empty name without a request and focuses the field', async () => {
      const ctx = await account();
      ctx.type('#name', '   ');
      ctx.submit('#profile-form');
      await ctx.seeText('Enter your name.');
      expect(document.activeElement?.id).toBe('name');
      ctx.http.expectNone('/api/v1/me');
    });

    it('shows a neutral message for a failure, never the raw server text', async () => {
      const ctx = await account();
      ctx.type('#name', 'Grace');
      ctx.submit('#profile-form');
      const e = error(500, 'INTERNAL');
      (await ctx.request('PATCH', '/me')).flush(e.body, e.init);
      await ctx.seeText('Something went wrong. Please try again.');
      expect(ctx.hasText('raw server text')).toBe(false);
    });
  });

  describe('change password', () => {
    const fill = (ctx: Awaited<ReturnType<typeof account>>, old = 'old password 1') => {
      ctx.type('#old-password', old);
      ctx.type('#new-password', 'a brand new password');
      ctx.type('#confirm-password', 'a brand new password');
    };

    it('Account change password shows OLD_PASSWORD_WRONG inline', async () => {
      const ctx = await account();
      fill(ctx);
      ctx.submit('#password-form');
      const req = await ctx.request('POST', '/me/change-password');
      expect(req.request.body).toEqual({
        oldPassword: 'old password 1',
        newPassword: 'a brand new password',
      });
      const wrong = error(400, 'OLD_PASSWORD_WRONG');
      req.flush(wrong.body, wrong.init);
      await ctx.seeText('Your current password is not correct.');
      expect(ctx.el.querySelector('#old-password')?.getAttribute('aria-invalid')).toBe('true');
      await vi.waitFor(() => expect(document.activeElement?.id).toBe('old-password'));
      expect(ctx.hasText('raw server text')).toBe(false);

      // Typing a new attempt clears it and the form submits again.
      ctx.type('#old-password', 'old password 2');
      ctx.submit('#password-form');
      const again = await ctx.request('POST', '/me/change-password');
      expect(again.request.body.oldPassword).toBe('old password 2');
      again.flush(null, noContent);
      await ctx.request('POST', '/auth/logout').then((r) => r.flush(null, noContent));
    });

    it('Account change password success logs the user out and navigates to /login', async () => {
      const ctx = await account();
      fill(ctx);
      ctx.submit('#password-form');
      (await ctx.request('POST', '/me/change-password')).flush(null, noContent);
      (await ctx.request('POST', '/auth/logout')).flush(null, noContent);
      await vi.waitFor(() => expect(ctx.url()).toBe('/login?notice=password-changed'));
      expect(TestBed.inject(AuthStore).isLoggedIn()).toBe(false);
      // The page was replaced by the login page, which shows the fixed notice.
      await vi.waitFor(() => {
        ctx.harness.detectChanges();
        expect(ctx.harness.routeNativeElement?.textContent).toContain(
          'Password changed, please log in again.',
        );
      });
    });

    it('checks the confirmation and the length before it sends anything', async () => {
      const ctx = await account();
      ctx.type('#old-password', 'x');
      ctx.type('#new-password', 'short');
      ctx.type('#confirm-password', 'different');
      ctx.submit('#password-form');
      await ctx.seeText('Use at least 10 characters.');
      await ctx.seeText('Passwords do not match.');
      expect(document.activeElement?.id).toBe('new-password');
      ctx.http.expectNone('/api/v1/me/change-password');
    });

    it('does not paint untouched fields as invalid', async () => {
      const ctx = await account();
      expect(
        ctx.el.querySelector('#password-form [role="alert"], #password-form p-message'),
      ).toBeNull();
    });

    it('maps a rate limit to its own message', async () => {
      const ctx = await account();
      fill(ctx);
      ctx.submit('#password-form');
      const limited = error(429, 'RATE_LIMITED');
      (await ctx.request('POST', '/me/change-password')).flush(limited.body, limited.init);
      await ctx.seeText('Too many attempts. Try again in a minute.');
    });
  });

  describe('change email', () => {
    it('sends the new address and password and says a verification email is on its way', async () => {
      const ctx = await account();
      ctx.type('#new-email', ' new@example.com ');
      ctx.type('#email-password', 'my password 12');
      ctx.submit('#email-form');
      const req = await ctx.request('POST', '/me/change-email');
      expect(req.request.body).toEqual({ newEmail: 'new@example.com', password: 'my password 12' });
      req.flush({ message: 'ok' }, { status: 202, statusText: 'Accepted' });
      await ctx.seeText('new@example.com');
      await ctx.seeText('Your email changes after you open it.');
      expect(ctx.el.querySelector<HTMLInputElement>('#new-email')!.value).toBe('');
    });

    it('shows PASSWORD_WRONG inline on the password field', async () => {
      const ctx = await account();
      ctx.type('#new-email', 'new@example.com');
      ctx.type('#email-password', 'nope nope nope');
      ctx.submit('#email-form');
      const wrong = error(400, 'PASSWORD_WRONG');
      (await ctx.request('POST', '/me/change-email')).flush(wrong.body, wrong.init);
      await ctx.seeText('That password is not correct.');
      await vi.waitFor(() => expect(document.activeElement?.id).toBe('email-password'));
    });

    it('rejects a malformed address without a request', async () => {
      const ctx = await account();
      ctx.type('#new-email', 'not an email');
      ctx.type('#email-password', 'my password 12');
      ctx.submit('#email-form');
      await ctx.seeText('Enter a valid email address.');
      ctx.http.expectNone('/api/v1/me/change-email');
    });
  });

  describe('delete account', () => {
    const open = async (ctx: Awaited<ReturnType<typeof account>>) => {
      const trigger = Array.from(ctx.el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Delete my account'),
      )!;
      trigger.click();
      await vi.waitFor(() => {
        ctx.harness.detectChanges();
        expect(document.querySelector('#delete-form')).not.toBeNull();
      });
      return trigger;
    };

    it('Account delete is disabled until DELETE is typed and a password is entered', async () => {
      const ctx = await account();
      await open(ctx);
      const button = () => ctx.submitButton('#delete-form');
      expect(button().disabled).toBe(true);
      ctx.typeIn('#delete-confirm', 'delete');
      ctx.typeIn('#delete-password', 'my password 12');
      expect(button().disabled).toBe(true); // the word is case sensitive
      ctx.typeIn('#delete-confirm', 'DELETE');
      expect(button().disabled).toBe(false);
      ctx.typeIn('#delete-password', '');
      expect(button().disabled).toBe(true);
    });

    it('Account delete success calls logout and navigates to /', async () => {
      const ctx = await account();
      await open(ctx);
      ctx.typeIn('#delete-confirm', 'DELETE');
      ctx.typeIn('#delete-password', 'my password 12');
      document
        .querySelector('#delete-form')!
        .dispatchEvent(new Event('submit', { cancelable: true }));
      const req = await ctx.request('DELETE', '/me');
      expect(req.request.body).toEqual({ password: 'my password 12' });
      req.flush(null, noContent);
      (await ctx.request('POST', '/auth/logout')).flush(null, noContent);
      await vi.waitFor(() => expect(ctx.url()).toBe('/'));
      expect(TestBed.inject(AuthStore).isLoggedIn()).toBe(false);
    });

    it('shows PASSWORD_WRONG and LAST_ADMIN inside the dialog and keeps it open', async () => {
      const ctx = await account();
      await open(ctx);
      ctx.typeIn('#delete-confirm', 'DELETE');
      ctx.typeIn('#delete-password', 'my password 12');
      const send = () =>
        document
          .querySelector('#delete-form')!
          .dispatchEvent(new Event('submit', { cancelable: true }));
      send();
      const wrong = error(400, 'PASSWORD_WRONG');
      (await ctx.request('DELETE', '/me')).flush(wrong.body, wrong.init);
      await vi.waitFor(() => {
        ctx.harness.detectChanges();
        expect(document.querySelector('#delete-form')?.textContent).toContain(
          'That password is not correct.',
        );
      });

      ctx.typeIn('#delete-password', 'my password 13');
      send();
      const last = error(409, 'LAST_ADMIN');
      (await ctx.request('DELETE', '/me')).flush(last.body, last.init);
      await vi.waitFor(() => {
        ctx.harness.detectChanges();
        expect(document.querySelector('#delete-form')?.textContent).toContain(
          'You are the last admin',
        );
      });
      expect(ctx.url()).toBe('/dashboard/account');
    });

    it('focuses the first field on open, closes on Escape and returns focus to the trigger', async () => {
      const ctx = await account();
      const trigger = await open(ctx);
      await vi.waitFor(() => expect(document.activeElement?.id).toBe('delete-confirm'));

      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await vi.waitFor(() => {
        ctx.harness.detectChanges();
        expect(document.querySelector('#delete-form')).toBeNull();
      });
      expect(document.activeElement).toBe(trigger);
    });
  });
});
