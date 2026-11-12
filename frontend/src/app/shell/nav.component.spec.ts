import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '../core/auth/auth.store';
import { UserDto } from '../core/models';
import { NavComponent } from './nav.component';

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  email: 'a@b.co',
  name: 'Ada',
  role,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('NavComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
  }

  it('links to the main sections', () => {
    const { el } = setup();
    const hrefs = Array.from(el.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/tv', '/movies', '/new']));
  });

  it('sends a visitor from My List to /login?next=/dashboard/favorites', () => {
    const { el } = setup();
    const myList = Array.from(el.querySelectorAll('nav a')).find(
      (a) => a.textContent === 'My List',
    );
    expect(myList!.getAttribute('href')).toBe('/login?next=%2Fdashboard%2Ffavorites');
  });

  describe('auth area', () => {
    /** Restores a session for the given user (or as a visitor when null), then renders. */
    async function restored(as: UserDto | null) {
      const ctx = setup();
      const done = TestBed.inject(AuthStore).restoreSession();
      const req = TestBed.inject(HttpTestingController).expectOne('/api/v1/auth/refresh');
      if (as) req.flush({ accessToken: 't', user: as });
      else req.flush({}, { status: 401, statusText: 'Unauthorized' });
      await done;
      await ctx.fixture.whenStable();
      return ctx;
    }
    const text = (el: HTMLElement) => el.textContent ?? '';

    it('renders nothing until the session restore has finished', () => {
      const { el } = setup();
      expect(text(el)).not.toContain('Log in');
      expect(el.querySelector('p-avatar')).toBeNull();
    });

    it('shows Log in and Register to visitors', async () => {
      const { el } = await restored(null);
      expect(text(el)).toContain('Log in');
      expect(text(el)).toContain('Register');
      expect(el.querySelector('p-avatar')).toBeNull();
    });

    it('shows an avatar menu with Favorites, Account and Log out to a user, and Admin only to an admin', async () => {
      const { fixture, el } = await restored(user('USER'));
      const labels = () =>
        Array.from(document.querySelectorAll('.p-menu-item-label')).map((l) => l.textContent);
      expect(el.querySelector('p-avatar')!.textContent).toContain('A');
      expect(text(el)).not.toContain('Log in');

      el.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')!.click();
      await fixture.whenStable();
      expect(labels()).toEqual(['Favorites', 'Account', 'Log out']);
    });

    it('lists Admin in the menu for an admin', async () => {
      const { fixture, el } = await restored(user('ADMIN'));
      el.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')!.click();
      await fixture.whenStable();
      const labels = Array.from(document.querySelectorAll('.p-menu-item-label')).map(
        (l) => l.textContent,
      );
      expect(labels).toEqual(['Favorites', 'Account', 'Admin', 'Log out']);
    });
  });

  async function submitSearch(
    fixture: ComponentFixture<NavComponent>,
    el: HTMLElement,
    text: string,
  ): Promise<Event> {
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = new Event('submit', { cancelable: true });
    input.closest('form')!.dispatchEvent(submit);
    await fixture.whenStable();
    return submit;
  }

  it('navigates to /search?q= with the trimmed query when the search form is submitted', async () => {
    const { fixture, el, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const submit = await submitSearch(fixture, el, ' dune ');
    expect(submit.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'dune' } });
  });

  it('does not navigate for an empty or blank query', async () => {
    const { fixture, el, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await submitSearch(fixture, el, '');
    await submitSearch(fixture, el, '   ');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not paint the untouched search box as invalid', () => {
    const { el } = setup();
    // Signal Forms passes the raw invalid state (empty) on to PrimeNG, which would draw a red border
    // on a pristine box. The form resets the invalid tokens to the neutral ones, as cv-auth-field does.
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    const form = input.closest('form')!;
    expect(form.className).toContain(
      '[--p-inputtext-invalid-border-color:var(--p-inputtext-border-color)]',
    );
    expect(form.className).toContain(
      '[--p-inputtext-invalid-placeholder-color:var(--p-inputtext-placeholder-color)]',
    );
  });

  describe('mobile search toggle', () => {
    const toggleOf = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('button[aria-label="Search titles"]')!;

    it('names the inner button and toggles aria-expanded on it', async () => {
      const { fixture, el } = setup();
      await fixture.whenStable();
      expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
      toggleOf(el).click();
      await fixture.whenStable();
      expect(toggleOf(el).getAttribute('aria-expanded')).toBe('true');
    });

    it('moves focus to the search input on open and back to the toggle on Escape', async () => {
      const { fixture, el } = setup();
      await fixture.whenStable();
      toggleOf(el).click();
      await fixture.whenStable();
      const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
      expect(document.activeElement).toBe(input);

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await fixture.whenStable();
      expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggleOf(el));
    });

    it('returns focus to the toggle when it closes the panel', async () => {
      const { fixture, el } = setup();
      await fixture.whenStable();
      toggleOf(el).click();
      await fixture.whenStable();
      toggleOf(el).click();
      await fixture.whenStable();
      expect(toggleOf(el).getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggleOf(el));
    });
  });
});
