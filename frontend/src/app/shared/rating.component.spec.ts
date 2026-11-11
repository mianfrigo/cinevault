import { TestBed } from '@angular/core/testing';
import { RatingComponent } from './rating.component';

function render(value: number | null): HTMLElement {
  const fixture = TestBed.createComponent(RatingComponent);
  fixture.componentRef.setInput('value', value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('RatingComponent', () => {
  it('renders "★ 8.6" for 8.6', () => {
    expect(render(8.6).textContent?.trim()).toBe('★ 8.6');
  });

  it('keeps one decimal for whole numbers', () => {
    expect(render(8).textContent?.trim()).toBe('★ 8.0');
  });

  it('renders nothing for null', () => {
    expect(render(null).textContent?.trim()).toBe('');
  });
});
