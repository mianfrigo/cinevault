import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PosterCardComponent } from './poster-card.component';
import { TitleSummary } from '../core/models';

const matrix: TitleSummary = {
  tmdbId: 603,
  mediaType: 'movie',
  title: 'The Matrix',
  year: 1999,
  rating: 8.2,
  posterUrl: 'https://image.tmdb.org/t/p/w342/matrix.jpg',
  backdropUrl: null,
  overview: null,
};

function render(title: TitleSummary): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PosterCardComponent);
  fixture.componentRef.setInput('title', title);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PosterCardComponent', () => {
  it('shows an img with alt "title (year)" and lazy loading', () => {
    const img = render(matrix).querySelector('img');
    expect(img?.getAttribute('alt')).toBe('The Matrix (1999)');
    expect(img?.getAttribute('loading')).toBe('lazy');
  });

  it('shows the title text and no img when posterUrl is null', () => {
    const el = render({ ...matrix, posterUrl: null });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('The Matrix');
  });

  it('links to /title/movie/603', () => {
    expect(render(matrix).querySelector('a')?.getAttribute('href')).toBe('/title/movie/603');
  });

  it('omits the year when year is null', () => {
    const el = render({ ...matrix, year: null });
    expect(el.textContent).not.toContain('1999');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('The Matrix');
  });
});
