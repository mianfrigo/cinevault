import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NavComponent } from './nav.component';

describe('NavComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, router: TestBed.inject(Router) };
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
});
