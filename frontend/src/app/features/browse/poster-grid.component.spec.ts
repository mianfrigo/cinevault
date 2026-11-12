import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TitleSummary } from '@core/models';
import { PosterGridComponent } from './poster-grid.component';

const item = (tmdbId: number): TitleSummary => ({
  tmdbId,
  mediaType: 'movie',
  title: `Title ${tmdbId}`,
  year: 2024,
  rating: 7,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
});

describe('PosterGridComponent', () => {
  function render(page: number, totalPages: number) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PosterGridComponent);
    fixture.componentRef.setInput('items', [item(1), item(2), item(3)]);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('totalPages', totalPages);
    fixture.detectChanges();
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    return { el: fixture.nativeElement as HTMLElement, emitted };
  }

  it('renders one poster card per item', () => {
    const { el } = render(1, 1);
    expect(el.querySelectorAll('cv-poster-card')).toHaveLength(3);
    expect(el.querySelector('nav[aria-label="Pagination"]')).toBeNull();
  });

  it('emits pageChange with the new page when the paginator changes', () => {
    const { el, emitted } = render(1, 5);
    el.querySelector<HTMLButtonElement>('[aria-label="Page 2"]')!.click();
    expect(emitted).toEqual([2]);
  });
});
