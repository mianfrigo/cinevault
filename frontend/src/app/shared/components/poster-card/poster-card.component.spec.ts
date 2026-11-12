import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '@core/auth/auth.store';
import { FavoritesStore } from '@core/favorites/favorites.store';
import { PosterCardComponent } from './poster-card.component';
import { TitleSummary } from '@core/models';

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
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(PosterCardComponent);
  fixture.componentRef.setInput('title', title);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const heart = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[aria-pressed]');

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

  it('heart calls FavoritesStore.toggle("movie", id)', async () => {
    const el = render(matrix);
    const http = TestBed.inject(HttpTestingController);
    const toggle = vi.spyOn(TestBed.inject(FavoritesStore), 'toggle');

    // Log in the way the app does: the session restore answers with a user.
    void TestBed.inject(AuthStore).restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({
      accessToken: 't',
      user: {
        id: 'u1',
        email: 'a@b.co',
        name: 'Ada',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    await vi.waitFor(() => expect(TestBed.inject(AuthStore).isLoggedIn()).toBe(true));
    TestBed.tick();
    http.expectOne('/api/v1/me/favorites/ids').flush([]);

    expect(heart(el)?.getAttribute('aria-pressed')).toBe('false');
    heart(el)?.click();
    expect(toggle).toHaveBeenCalledWith('movie', 603);

    const put = await vi.waitFor(() => http.expectOne('/api/v1/me/favorites/movie/603'));
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });
    http.verify();
  });

  it('in removable mode the button removes instead of toggling: it names the removal and emits removed', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PosterCardComponent);
    fixture.componentRef.setInput('title', matrix);
    fixture.componentRef.setInput('removable', true);
    const removed = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);
    const toggle = vi.spyOn(TestBed.inject(FavoritesStore), 'toggle');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const button = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove The Matrix from favorites"]',
    )!;
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    button.click();
    expect(removed).toHaveBeenCalledTimes(1);
    expect(toggle).not.toHaveBeenCalled();
  });

  describe('meta line (detailed)', () => {
    function renderDetailed(title: TitleSummary): HTMLElement {
      TestBed.configureTestingModule({
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(PosterCardComponent);
      fixture.componentRef.setInput('title', title);
      fixture.componentRef.setInput('detailed', true);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('shows "year · Movie" at the left and the score at the right', () => {
      const el = renderDetailed(matrix);
      const meta = el.querySelector('[data-meta]')!;
      expect(meta.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        '1999 · Movie',
      );
      expect(meta.querySelector('cv-score')?.textContent?.trim()).toBe('8.2');
    });

    it('labels a series "Series"', () => {
      const el = renderDetailed({ ...matrix, mediaType: 'tv' });
      expect(el.querySelector('[data-meta]')?.textContent).toContain('1999 · Series');
    });

    it('shows no score and never the words null or undefined when the rating is null', () => {
      const el = renderDetailed({ ...matrix, rating: null });
      expect(el.querySelector('[data-meta] cv-score')?.textContent?.trim()).toBe('');
      expect(el.querySelector('[data-meta] p-rating')).toBeNull();
      expect(el.textContent).not.toMatch(/null|undefined|NaN/);
    });

    it('shows only the type when the year is unknown', () => {
      const el = renderDetailed({ ...matrix, year: null });
      const left = el.querySelector('[data-meta] span')?.textContent?.replace(/\s+/g, ' ').trim();
      expect(left).toBe('Movie');
    });

    it('is off by default: the plain card keeps the year only', () => {
      const el = render(matrix);
      expect(el.querySelector('[data-meta]')).toBeNull();
      expect(el.textContent).not.toContain('Movie');
    });
  });
});
