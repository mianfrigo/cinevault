import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavComponent } from './nav.component';

describe('NavComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
  }

  it('links to the main sections', () => {
    const { el } = setup();
    const hrefs = Array.from(el.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/', '/tv', '/movies', '/new', '/dashboard/favorites']),
    );
  });

  it('navigates to /search?q= when the search form is submitted (Enter)', () => {
    const { el, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = ' dune ';
    input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(navigate).toHaveBeenCalledWith(['/search'], { queryParams: { q: 'dune' } });
  });

  it('does not navigate for an empty query', () => {
    const { el, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(navigate).not.toHaveBeenCalled();
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
