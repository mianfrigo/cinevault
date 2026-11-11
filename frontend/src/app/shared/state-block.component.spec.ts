import { TestBed } from '@angular/core/testing';
import { StateBlockComponent } from './state-block.component';

function setup(kind: 'loading' | 'empty' | 'error', message?: string) {
  const fixture = TestBed.createComponent(StateBlockComponent);
  fixture.componentRef.setInput('kind', kind);
  if (message) fixture.componentRef.setInput('message', message);
  fixture.detectChanges();
  return fixture;
}

describe('StateBlockComponent', () => {
  it('in error state shows the message and emits retry when Retry is clicked', () => {
    const fixture = setup('error', 'Could not load titles. Check your connection and retry.');
    const el = fixture.nativeElement as HTMLElement;
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);

    expect(el.textContent).toContain('Could not load titles. Check your connection and retry.');
    const button = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    );
    button?.click();
    expect(retries).toBe(1);
  });

  it('in loading state shows skeletons and no Retry button', () => {
    const el = setup('loading').nativeElement as HTMLElement;
    expect(el.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('button')).toBeNull();
  });

  it('in empty state shows the message sentence', () => {
    const el = setup('empty', 'Nothing here yet.').nativeElement as HTMLElement;
    expect(el.textContent).toContain('Nothing here yet.');
  });
});
