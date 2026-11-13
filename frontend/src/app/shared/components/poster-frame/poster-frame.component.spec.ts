import { TestBed } from '@angular/core/testing';
import { PosterFrameComponent } from './poster-frame.component';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(PosterFrameComponent);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, img: el.querySelector('img'), ring: el.querySelector('[aria-hidden=true]') };
}

describe('PosterFrameComponent', () => {
  it('shows the poster lazily, with the title as its alt text', () => {
    const { img, el } = render({ src: 'https://img.test/p.jpg', title: 'Dune' });
    expect(img?.getAttribute('src')).toBe('https://img.test/p.jpg');
    expect(img?.getAttribute('alt')).toBe('Dune');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.hasAttribute('fetchpriority')).toBe(false);
    expect(el.textContent?.trim()).toBe('');
  });

  it('takes its own alt text', () => {
    expect(
      render({ src: 'x.jpg', title: 'Dune', alt: 'Dune (2021)' }).img?.getAttribute('alt'),
    ).toBe('Dune (2021)');
  });

  it('loads an eager poster at high priority', () => {
    const { img } = render({ src: 'x.jpg', title: 'Dune', eager: true });
    expect(img?.hasAttribute('loading')).toBe(false);
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('falls back to the title on a plain field when there is no poster (null or undefined)', () => {
    for (const src of [null, undefined, '']) {
      const { img, el } = render({ src, title: 'No Poster Film' });
      expect(img).toBeNull();
      expect(el.textContent?.trim()).toBe('No Poster Film');
      expect(el.querySelector('div')?.className).toContain('bg-surface-3');
    }
  });

  it('keeps the ring on the frame, or draws it over the image when asked', () => {
    const plain = render({ src: 'x.jpg', title: 'T' });
    expect(plain.el.className).toContain('ring-1');
    expect(plain.ring).toBeNull();

    const over = render({ src: 'x.jpg', title: 'T', overlayRing: true });
    expect(over.el.className).not.toContain('ring-1');
    expect(over.ring?.className).toContain('ring-1');
  });

  it('is a 2:3 tile', () => {
    expect(render({ title: 'T' }).el.className).toContain('aspect-[2/3]');
  });
});
