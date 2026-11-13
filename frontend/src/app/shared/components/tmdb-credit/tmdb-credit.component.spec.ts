import { TestBed } from '@angular/core/testing';
import { TmdbCreditComponent } from './tmdb-credit.component';

describe('TmdbCreditComponent', () => {
  it('renders the exact attribution sentence', () => {
    const fixture = TestBed.createComponent(TmdbCreditComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p')?.textContent).toBe(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    );
  });
});
