import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GenreTile, GenreTileComponent } from './genre-tile.component';

const sciFi: GenreTile = {
  id: 878,
  name: 'Science Fiction',
  label: 'Sci-Fi',
  tone: 'bg-tone-dusk text-tone-dusk-fg',
  coverUrl: 'https://image.tmdb.org/t/p/w780/878.jpg',
};

function render(genre: GenreTile) {
  const fixture = TestBed.createComponent(GenreTileComponent);
  fixture.componentRef.setInput('genre', genre);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    a: el.querySelector('a')!,
    img: () => el.querySelector('img'),
    wrapper: () => el.querySelector('img')?.parentElement,
  };
}

describe('GenreTileComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('links to the genre and shows the short label with the full name for screen readers', () => {
    const { a } = render(sciFi);
    expect(a.getAttribute('href')).toBe('/genre/movie/878');
    expect(a.className).toContain('bg-tone-dusk');
    expect(a.querySelector('[aria-hidden=true]')?.textContent).toBe('Sci-Fi');
    expect(a.querySelector('.sr-only')?.textContent).toBe('Science Fiction');
  });

  it('adds no screen reader duplicate when the label is the name', () => {
    const { a } = render({ ...sciFi, label: 'Science Fiction' });
    expect(a.querySelector('.sr-only')).toBeNull();
  });

  it('renders no image without a cover', () => {
    expect(render({ ...sciFi, coverUrl: null }).img()).toBeNull();
  });

  it('keeps the cover hidden until it loads, and drops it when it fails', () => {
    const t = render(sciFi);
    expect(t.wrapper()?.className).toContain('opacity-0');
    t.img()!.dispatchEvent(new Event('load'));
    t.fixture.detectChanges();
    expect(t.wrapper()?.className).not.toContain('opacity-0');

    const failed = render(sciFi);
    failed.img()!.dispatchEvent(new Event('error'));
    failed.fixture.detectChanges();
    expect(failed.img()).toBeNull();
  });

  it('recovers a cover that settled before the listeners were attached', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(780);
    const t = render(sciFi);
    t.fixture.detectChanges();
    expect(t.wrapper()?.className).not.toContain('opacity-0');
    vi.restoreAllMocks();
  });
});
