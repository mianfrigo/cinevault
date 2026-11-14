import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '@core/auth/auth.store';
import { UserDto } from '@core/models';
import { UserMenuComponent } from './user-menu.component';

const alex = (role: 'USER' | 'ADMIN' = 'USER'): UserDto =>
  ({
    id: 'u1',
    name: 'Alex Mercer',
    email: 'alex.mercer@example.com',
    role,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
  }) as UserDto;

describe('UserMenuComponent', () => {
  function setup(user = alex()) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthStore).setUser(user);
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const trigger = () => el.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')!;
    return { fixture, el, trigger };
  }

  afterEach(() => document.body.replaceChildren());

  it('shows the initials, the short name and a chevron on the trigger', () => {
    const { el, trigger } = setup();
    expect(el.querySelector('p-avatar')!.textContent).toContain('AM');
    expect(trigger().textContent).toContain('Alex M.');
    expect(trigger().querySelector('.pi-chevron-down')).not.toBeNull();
  });

  it('keeps the name off the trigger below the laptop width', () => {
    const { trigger } = setup();
    const name = Array.from(trigger().querySelectorAll('span')).find((s) =>
      s.textContent?.includes('Alex M.'),
    )!;
    expect(name.className).toMatch(/\bhidden\b/);
    expect(name.className).toContain('lg:inline');
  });

  it('opens a panel headed by the full name and the email, then the links', async () => {
    const { fixture, trigger } = setup();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    trigger().click();
    await fixture.whenStable();

    const panel = document.querySelector('.p-menu')!;
    expect(panel.textContent).toContain('Alex Mercer');
    expect(panel.textContent).toContain('alex.mercer@example.com');
    expect(
      Array.from(panel.querySelectorAll('.p-menu-item-label')).map((l) => l.textContent),
    ).toEqual(['Favorites', 'Account', 'Log out']);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('adds Admin for an admin', async () => {
    const { fixture, trigger } = setup(alex('ADMIN'));
    trigger().click();
    await fixture.whenStable();
    expect(
      Array.from(document.querySelectorAll('.p-menu-item-label')).map((l) => l.textContent),
    ).toEqual(['Favorites', 'Account', 'Admin', 'Log out']);
  });
});
