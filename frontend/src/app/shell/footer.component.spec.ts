import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('contains the exact TMDB attribution sentence', () => {
    expect(render().textContent).toContain(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    );
  });

  it('links to /terms and /privacy', () => {
    const hrefs = Array.from(render().querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/terms', '/privacy']));
  });
});
