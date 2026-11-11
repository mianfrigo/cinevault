import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TitleSummary } from '../../core/models';
import { HeroComponent } from './hero.component';

const title = (tmdbId: number, name: string, backdropUrl: string | null): TitleSummary => ({
  tmdbId,
  mediaType: 'movie',
  title: name,
  year: 2021,
  rating: 8.6,
  posterUrl: null,
  backdropUrl,
  overview: `${name} overview`,
});

const three = [
  title(1, 'Astral Frontier', 'https://image.tmdb.org/t/p/w1280/a.jpg'),
  title(2, 'Cold Meridian', 'https://image.tmdb.org/t/p/w1280/b.jpg'),
  title(3, 'Ember Coast', 'https://image.tmdb.org/t/p/w1280/c.jpg'),
];

/** Pretends the browser does (or does not) match prefers-reduced-motion. */
function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function render(items: TitleSummary[]) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(HeroComponent);
  fixture.componentRef.setInput('items', items);
  fixture.detectChanges();
  await fixture.whenStable(); // lets afterNextRender (the autoplay set-up) run
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const activeSlide = () =>
    el.querySelector<HTMLElement>('[aria-roledescription="slide"]:not([aria-hidden="true"])');
  const click = (label: string) => {
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
    fixture.detectChanges();
  };
  const activeFill = () => el.querySelector<HTMLElement>('button[aria-current="true"] [data-fill]');
  return { fixture, el, activeSlide, click, activeFill };
}

describe('HeroComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the first item and the next control advances', async () => {
    stubReducedMotion(false);
    const { el, activeSlide, click } = await render(three);

    expect(el.querySelector('[aria-roledescription="carousel"]')).not.toBeNull();
    expect(activeSlide()?.getAttribute('aria-label')).toBe('1 of 3');
    expect(activeSlide()?.textContent).toContain('Astral Frontier');
    expect(el.querySelector('img')?.getAttribute('fetchpriority')).toBe('high');

    click('Next slide');
    expect(activeSlide()?.getAttribute('aria-label')).toBe('2 of 3');
    expect(activeSlide()?.textContent).toContain('Cold Meridian');

    click('Next slide');
    click('Next slide');
    expect(activeSlide()?.getAttribute('aria-label')).toBe('1 of 3'); // wraps around
  });

  it('advances when the active progress bar finishes and goes back with the left arrow key', async () => {
    stubReducedMotion(false);
    const { fixture, el, activeSlide, activeFill } = await render(three);

    activeFill()?.dispatchEvent(new Event('animationend', { bubbles: true }));
    fixture.detectChanges();
    expect(activeSlide()?.getAttribute('aria-label')).toBe('2 of 3');

    el.querySelector('section')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    fixture.detectChanges();
    expect(activeSlide()?.getAttribute('aria-label')).toBe('1 of 3');
  });

  it('does not autoplay when prefers-reduced-motion matches', async () => {
    stubReducedMotion(true);
    const { fixture, activeSlide, activeFill } = await render(three);

    // No timed animation is running, and a stray animationend must not move the slide.
    expect(activeFill()?.classList.contains('animate-hero-fill')).toBe(false);
    activeFill()?.dispatchEvent(new Event('animationend', { bubbles: true }));
    fixture.detectChanges();
    expect(activeSlide()?.getAttribute('aria-label')).toBe('1 of 3');
  });

  it('stops autoplay while paused and resumes on a second press', async () => {
    stubReducedMotion(false);
    const { fixture, activeSlide, activeFill, click } = await render(three);
    expect(activeFill()?.classList.contains('animate-hero-fill')).toBe(true);

    click('Pause automatic slide change');
    expect(activeFill()?.style.animationPlayState).toBe('paused');

    click('Resume automatic slide change');
    expect(activeFill()?.style.animationPlayState).toBe('running');
    expect(activeSlide()?.getAttribute('aria-label')).toBe('1 of 3');
    expect(fixture.nativeElement.querySelector('button[aria-pressed]')).not.toBeNull();
  });

  it('omits items without backdropUrl and renders nothing when none have one', async () => {
    stubReducedMotion(false);
    const mixed = [title(9, 'No Art', null), three[0], title(8, 'Also No Art', null), three[1]];
    const some = await render(mixed);
    expect(some.activeSlide()?.getAttribute('aria-label')).toBe('1 of 2');
    expect(some.el.textContent).not.toContain('No Art');
    TestBed.resetTestingModule();

    const none = await render([title(9, 'No Art', null)]);
    expect(none.el.querySelector('section')).toBeNull();
    expect(none.el.textContent?.trim()).toBe('');
  });
});
