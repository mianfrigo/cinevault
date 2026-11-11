import { TestBed } from '@angular/core/testing';
import { ScoreComponent } from './score.component';

async function render(value: number | null): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(ScoreComponent);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('ScoreComponent', () => {
  it('renders one filled PrimeNG star and the numeric score for 8.6', async () => {
    const el = await render(8.6);
    expect(el.querySelectorAll('p-rating')).toHaveLength(1);
    expect(el.querySelectorAll('.p-rating-option[data-highlighted]')).toHaveLength(1);
    expect(el.textContent?.trim()).toBe('8.6');
  });

  it('keeps one decimal for whole numbers', async () => {
    expect((await render(8)).textContent?.trim()).toBe('8.0');
  });

  it('renders nothing for null, undefined and NaN', async () => {
    for (const v of [null, undefined as unknown as null, NaN]) {
      const el = await render(v);
      expect(el.querySelector('p-rating')).toBeNull();
      expect(el.textContent?.trim()).toBe('');
    }
  });

  it('is not editable: clicking the star keeps it filled', async () => {
    const el = await render(8.6);
    const option = el.querySelector<HTMLElement>('.p-rating-option')!;
    expect(option.querySelector('input')!.hasAttribute('readonly')).toBe(true);
    option.querySelector('input')!.click();
    option.click();
    expect(option.hasAttribute('data-highlighted')).toBe(true);
  });
});
