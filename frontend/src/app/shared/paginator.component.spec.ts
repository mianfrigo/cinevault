import { TestBed } from '@angular/core/testing';
import { PaginatorComponent } from './paginator.component';

function render(page: number, totalPages: number) {
  const fixture = TestBed.createComponent(PaginatorComponent);
  fixture.componentRef.setInput('page', page);
  fixture.componentRef.setInput('totalPages', totalPages);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const emitted: number[] = [];
  fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
  return { fixture, el, emitted };
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button'));
const prev = (el: HTMLElement) =>
  el.querySelector<HTMLButtonElement>('[aria-label="Previous page"]')!;
const next = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!;
/** Visible tokens in order: numbers and ellipses (the Prev and Next buttons are left out). */
const tokens = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('li')).map((li) => li.textContent?.trim());

describe('PaginatorComponent', () => {
  it('renders Prev, numbered buttons with ellipses and Next; the current page has aria-current="page"', () => {
    const { el } = render(50, 100);
    const nav = el.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Pagination');
    expect(tokens(el)).toEqual(['1', '…', '48', '49', '50', '51', '52', '…', '100']);
    expect(prev(el)).not.toBeNull();
    expect(next(el)).not.toBeNull();
    const current = el.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent?.trim()).toBe('50');
  });

  it('shows the first five pages and the last page near the start, and mirrors that near the end', () => {
    expect(tokens(render(1, 100).el)).toEqual(['1', '2', '3', '4', '5', '…', '100']);
    expect(tokens(render(100, 100).el)).toEqual(['1', '…', '96', '97', '98', '99', '100']);
    expect(tokens(render(2, 4).el)).toEqual(['1', '2', '3', '4']);
  });

  it('disables Prev on page 1 and Next on the last page', () => {
    const first = render(1, 5).el;
    expect(prev(first).disabled).toBe(true);
    expect(next(first).disabled).toBe(false);
    const last = render(5, 5).el;
    expect(prev(last).disabled).toBe(false);
    expect(next(last).disabled).toBe(true);
  });

  it('emits pageChange with the clicked page number', () => {
    const { el, emitted } = render(3, 10);
    buttons(el)
      .find((b) => b.textContent?.trim() === '4')!
      .click();
    next(el).click();
    prev(el).click();
    expect(emitted).toEqual([4, 4, 2]);
  });

  it('does not emit when the current page is clicked', () => {
    const { el, emitted } = render(3, 10);
    el.querySelector<HTMLButtonElement>('[aria-current="page"]')!.click();
    expect(emitted).toEqual([]);
  });

  it('renders nothing when totalPages is 1 or less', () => {
    for (const total of [1, 0, -3, NaN]) {
      expect(render(1, total).el.querySelector('nav')).toBeNull();
    }
  });

  it('keeps the current page inside 1..totalPages', () => {
    expect(tokens(render(99, 3).el)).toEqual(['1', '2', '3']);
    expect(render(99, 3).el.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('3');
  });
});
